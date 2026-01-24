import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { Client } from '@line/bot-sdk';
import { buildPenaltyLiffUrl, calculateOverdueDays, getPenaltyRequirement, normalizeDate } from '@/lib/services/penalty';

const pawnerClient = process.env.LINE_CHANNEL_ACCESS_TOKEN && process.env.LINE_CHANNEL_SECRET
  ? new Client({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET,
  })
  : null;

const investorClient = process.env.LINE_CHANNEL_ACCESS_TOKEN_INVEST && process.env.LINE_CHANNEL_SECRET_INVEST
  ? new Client({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN_INVEST,
    channelSecret: process.env.LINE_CHANNEL_SECRET_INVEST,
  })
  : null;

const formatThaiDate = (value: Date | string) => (
  new Date(value).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
);

const getContractsLiffUrl = () => {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_CONTRACTS || '2008216710-WJXR6xOM';
  return `https://liff.line.me/${liffId}`;
};

const ensureCronAuthorized = (request: NextRequest) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return true;
  }

  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return token === secret;
};

const buildDayRange = (day: Date) => {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return {
    start,
    end,
  };
};

const shouldSendToday = async (supabase: any, params: {
  recipientType: 'PAWNER' | 'INVESTOR';
  recipientId: string;
  notificationType: string;
  contractId: string;
  dayStart: Date;
  dayEnd: Date;
}) => {
  const { recipientType, recipientId, notificationType, contractId, dayStart, dayEnd } = params;
  const { count, error } = await supabase
    .from('notifications')
    .select('notification_id', { count: 'exact', head: true })
    .eq('recipient_type', recipientType)
    .eq('recipient_id', recipientId)
    .eq('notification_type', notificationType)
    .eq('related_entity_id', contractId)
    .gte('created_at', dayStart.toISOString())
    .lt('created_at', dayEnd.toISOString());

  if (error) {
    console.error('Error checking notifications:', error);
    return true;
  }

  return (count || 0) === 0;
};

const recordNotification = async (supabase: any, params: {
  recipientType: 'PAWNER' | 'INVESTOR';
  recipientId: string;
  notificationType: string;
  title: string;
  message: string;
  contractId: string;
}) => {
  const { recipientType, recipientId, notificationType, title, message, contractId } = params;
  await supabase
    .from('notifications')
    .insert({
      recipient_type: recipientType,
      recipient_id: recipientId,
      notification_type: notificationType,
      title,
      message,
      related_entity_type: 'CONTRACT',
      related_entity_id: contractId,
      sent_via: ['LINE'],
      created_at: new Date().toISOString(),
    });
};

const sendLineMessage = async (client: Client | null, lineId: string | null, text: string) => {
  if (!client || !lineId) {
    return false;
  }

  try {
    await client.pushMessage(lineId, { type: 'text', text });
    return true;
  } catch (error) {
    console.error('Error sending LINE message:', error);
    return false;
  }
};

const runReminders = async (supabase: any, today: Date) => {
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  const todayStart = normalizeDate(today);
  const rangeEnd = new Date(todayStart);
  rangeEnd.setDate(rangeEnd.getDate() + 3);
  rangeEnd.setHours(23, 59, 59, 999);

  const { data: upcomingContracts, error: upcomingError } = await supabase
    .from('contracts')
    .select(`
      contract_id,
      contract_number,
      contract_start_date,
      contract_end_date,
      customer_id,
      investor_id,
      pawners:customer_id (
        line_id
      ),
      investors:investor_id (
        line_id
      )
    `)
    .in('contract_status', ['ACTIVE', 'CONFIRMED'])
    .gte('contract_end_date', todayStart.toISOString())
    .lte('contract_end_date', rangeEnd.toISOString());

  if (upcomingError) {
    throw upcomingError;
  }

  const results = {
    pawnerDue3: 0,
    pawnerDue1: 0,
    pawnerDueToday: 0,
    investorDueToday: 0,
    penaltyDue: 0,
  };

  const contractsLiffUrl = getContractsLiffUrl();
  const { start: dayStart, end: dayEnd } = buildDayRange(todayStart);

  for (const contract of upcomingContracts || []) {
    const endDate = normalizeDate(contract.contract_end_date);
    const daysUntilDue = Math.round((endDate.getTime() - todayStart.getTime()) / MS_PER_DAY);
    const pawner = Array.isArray(contract.pawners) ? contract.pawners[0] : contract.pawners;
    const investor = Array.isArray(contract.investors) ? contract.investors[0] : contract.investors;

    if (daysUntilDue === 3) {
      const title = 'แจ้งเตือนใกล้ครบกำหนด';
      const message = `คุณมีสัญญาใกล้ถึงกำหนดชำระเงินในอีก 3 วัน\nหมายเลขสัญญา: ${contract.contract_number}\nกรุณาเข้าไปตรวจสอบสัญญาที่ ${contractsLiffUrl}`;

      const shouldSend = await shouldSendToday(supabase, {
        recipientType: 'PAWNER',
        recipientId: contract.customer_id,
        notificationType: 'CONTRACT_DUE_IN_3_DAYS',
        contractId: contract.contract_id,
        dayStart,
        dayEnd,
      });

      if (shouldSend) {
        const sent = await sendLineMessage(pawnerClient, pawner?.line_id || null, message);
        if (sent) {
          await recordNotification(supabase, {
            recipientType: 'PAWNER',
            recipientId: contract.customer_id,
            notificationType: 'CONTRACT_DUE_IN_3_DAYS',
            title,
            message,
            contractId: contract.contract_id,
          });
          results.pawnerDue3 += 1;
        }
      }
    }

    if (daysUntilDue === 1) {
      const title = 'แจ้งเตือนครบกำหนดพรุ่งนี้';
      const message = `พรุ่งนี้มีสัญญาที่จะถึงกำหนดการชำระเงิน\nหมายเลขสัญญา: ${contract.contract_number}\nกรุณาเข้าไปตรวจสอบสัญญาที่ ${contractsLiffUrl}`;

      const shouldSend = await shouldSendToday(supabase, {
        recipientType: 'PAWNER',
        recipientId: contract.customer_id,
        notificationType: 'CONTRACT_DUE_IN_1_DAY',
        contractId: contract.contract_id,
        dayStart,
        dayEnd,
      });

      if (shouldSend) {
        const sent = await sendLineMessage(pawnerClient, pawner?.line_id || null, message);
        if (sent) {
          await recordNotification(supabase, {
            recipientType: 'PAWNER',
            recipientId: contract.customer_id,
            notificationType: 'CONTRACT_DUE_IN_1_DAY',
            title,
            message,
            contractId: contract.contract_id,
          });
          results.pawnerDue1 += 1;
        }
      }
    }

    if (daysUntilDue === 0) {
      const title = 'แจ้งเตือนครบกำหนดวันนี้';
      const message = `วันนี้มีสัญญาครบกำหนด\nหมายเลขสัญญา: ${contract.contract_number}\nกรุณาเข้าไปตรวจสอบสัญญาที่ ${contractsLiffUrl}`;

      const shouldSendPawner = await shouldSendToday(supabase, {
        recipientType: 'PAWNER',
        recipientId: contract.customer_id,
        notificationType: 'CONTRACT_DUE_TODAY',
        contractId: contract.contract_id,
        dayStart,
        dayEnd,
      });

      if (shouldSendPawner) {
        const sent = await sendLineMessage(pawnerClient, pawner?.line_id || null, message);
        if (sent) {
          await recordNotification(supabase, {
            recipientType: 'PAWNER',
            recipientId: contract.customer_id,
            notificationType: 'CONTRACT_DUE_TODAY',
            title,
            message,
            contractId: contract.contract_id,
          });
          results.pawnerDueToday += 1;
        }
      }

      const investorMessage = `วันนี้มีสัญญาครบกำหนด\nหมายเลขสัญญา: ${contract.contract_number}`;
      const shouldSendInvestor = contract.investor_id
        ? await shouldSendToday(supabase, {
          recipientType: 'INVESTOR',
          recipientId: contract.investor_id,
          notificationType: 'CONTRACT_DUE_TODAY_INVESTOR',
          contractId: contract.contract_id,
          dayStart,
          dayEnd,
        })
        : false;

      if (shouldSendInvestor && investor?.line_id) {
        const sent = await sendLineMessage(investorClient, investor.line_id, investorMessage);
        if (sent) {
          await recordNotification(supabase, {
            recipientType: 'INVESTOR',
            recipientId: contract.investor_id,
            notificationType: 'CONTRACT_DUE_TODAY_INVESTOR',
            title,
            message: investorMessage,
            contractId: contract.contract_id,
          });
          results.investorDueToday += 1;
        }
      }
    }
  }

  const { data: overdueContracts, error: overdueError } = await supabase
    .from('contracts')
    .select(`
      contract_id,
      contract_number,
      contract_start_date,
      contract_end_date,
      customer_id,
      investor_id,
      pawners:customer_id (
        line_id
      )
    `)
    .in('contract_status', ['ACTIVE', 'CONFIRMED'])
    .lt('contract_end_date', todayStart.toISOString());

  if (overdueError) {
    throw overdueError;
  }

  for (const contract of overdueContracts || []) {
    try {
      const requirement = await getPenaltyRequirement(supabase, contract);
      if (!requirement.required) {
        continue;
      }

      const daysOverdue = calculateOverdueDays(contract.contract_end_date, todayStart);
      const penaltyAmount = daysOverdue * 100;
      const penaltyLink = buildPenaltyLiffUrl(contract.contract_id);

      const title = 'แจ้งเตือนค่าปรับค้างชำระ';
      const message = [
        `คุณมีสัญญาที่เริ่มต้นวันที่ ${formatThaiDate(contract.contract_start_date)} และสิ้นสุดวันที่ ${formatThaiDate(contract.contract_end_date)}`,
        `วันนี้วันที่ ${formatThaiDate(todayStart)} ซึ่งเกินกำหนดมาแล้ว ${daysOverdue} วัน`,
        `ค่าปรับวันละ 100 บาท รวมเป็น ${penaltyAmount.toLocaleString()} บาท`,
        `กรุณาเข้าลิงค์นี้เพื่อทำรายการจ่ายเงินค่าปรับ ${penaltyLink}`,
      ].join('\n');

      const { start, end } = buildDayRange(todayStart);
      const shouldSend = await shouldSendToday(supabase, {
        recipientType: 'PAWNER',
        recipientId: contract.customer_id,
        notificationType: 'CONTRACT_PENALTY_DUE',
        contractId: contract.contract_id,
        dayStart: start,
        dayEnd: end,
      });

      if (!shouldSend) {
        continue;
      }

      const pawner = Array.isArray(contract.pawners) ? contract.pawners[0] : contract.pawners;
      const sent = await sendLineMessage(pawnerClient, pawner?.line_id || null, message);
      if (sent) {
        await recordNotification(supabase, {
          recipientType: 'PAWNER',
          recipientId: contract.customer_id,
          notificationType: 'CONTRACT_PENALTY_DUE',
          title,
          message,
          contractId: contract.contract_id,
        });
        results.penaltyDue += 1;
      }
    } catch (error) {
      console.error(`Error sending penalty reminder for contract ${contract.contract_id}:`, error);
    }
  }

  return results;
};

export async function POST(request: NextRequest) {
  try {
    if (!ensureCronAuthorized(request)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const supabase = supabaseAdmin();
    const results = await runReminders(supabase, new Date());

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error: any) {
    console.error('Error sending due reminders:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
