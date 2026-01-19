import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ contractId: string }> }
) {
  try {
    const { contractId } = await context.params;
    const { searchParams } = new URL(request.url);
    const viewer = searchParams.get('viewer') || 'public';

    if (!contractId) {
      return NextResponse.json(
        { error: 'Contract ID is required' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // Fetch complete contract data for pawn ticket
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select(`
        *,
        pawner:pawners!customer_id (
          customer_id,
          firstname,
          lastname,
          phone_number,
          national_id,
          addr_house_no,
          addr_village,
          addr_street,
          addr_sub_district,
          addr_district,
          addr_province,
          addr_postcode,
          signature_url
        ),
        investor:investors!investor_id (
          investor_id,
          firstname,
          lastname,
          phone_number,
          national_id,
          addr_house_no,
          addr_village,
          addr_street,
          addr_sub_district,
          addr_district,
          addr_province,
          addr_postcode,
          bank_name,
          bank_account_no,
          bank_account_name
        ),
        items (
          item_id,
          item_type,
          brand,
          model,
          capacity,
          serial_number,
          estimated_value,
          item_condition,
          accessories,
          defects,
          notes,
          image_urls,
          cpu,
          ram,
          storage,
          gpu
        ),
        drop_points (
          drop_point_id,
          drop_point_name,
          drop_point_code,
          phone_number,
          addr_house_no,
          addr_street,
          addr_sub_district,
          addr_district,
          addr_province,
          addr_postcode
        )
      `)
      .eq('contract_id', contractId)
      .single();

    if (contractError || !contract) {
      console.error('Contract not found:', contractError);
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    // Format Thai date
    const formatThaiDate = (dateString: string) => {
      const date = new Date(dateString);
      const thaiMonths = [
        'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
        'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
      ];
      const day = date.getDate();
      const month = thaiMonths[date.getMonth()];
      const year = date.getFullYear() + 543; // Convert to Buddhist year
      return `${day} ${month} ${year}`;
    };

    // Format amount to Thai text
    const numberToThaiText = (num: number): string => {
      const digits = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
      const units = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];

      const readNumber = (value: number): string => {
        if (value === 0) return '';
        let result = '';
        if (value >= 1000000) {
          const millions = Math.floor(value / 1000000);
          result += readNumber(millions) + 'ล้าน';
          value = value % 1000000;
        }

        const valueDigits = value.toString().split('').map(Number);
        const len = valueDigits.length;
        valueDigits.forEach((digit, index) => {
          const pos = len - index - 1;
          if (digit === 0) return;

          if (pos === 0) {
            result += digit === 1 && len > 1 ? 'เอ็ด' : digits[digit];
            return;
          }
          if (pos === 1) {
            if (digit === 1) {
              result += 'สิบ';
            } else if (digit === 2) {
              result += 'ยี่สิบ';
            } else {
              result += digits[digit] + 'สิบ';
            }
            return;
          }
          result += digits[digit] + units[pos];
        });
        return result;
      };

      if (!num || num <= 0) return 'ศูนย์บาทถ้วน';
      const intPart = Math.floor(num);
      const text = readNumber(intPart) || 'ศูนย์';
      return `(-${text}บาทถ้วน-)`;
    };

    // Format item description
    const formatItemDescription = (item: any) => {
      let description = `${item.item_type} ${item.brand} ${item.model}`;

      if (item.capacity) {
        description += ` ความจุ ${item.capacity}`;
      }

      if (item.cpu || item.ram || item.storage) {
        const specs = [];
        if (item.cpu) specs.push(`CPU: ${item.cpu}`);
        if (item.ram) specs.push(`RAM: ${item.ram}`);
        if (item.storage) specs.push(`Storage: ${item.storage}`);
        if (item.gpu) specs.push(`GPU: ${item.gpu}`);
        description += ` (${specs.join(', ')})`;
      }

      if (item.item_condition) {
        description += ` สภาพ ${item.item_condition}%`;
      }

      if (item.accessories) {
        description += ` พร้อม${item.accessories}`;
      }

      return description;
    };

    // Format address
    const formatAddress = (addr: any) => {
      const parts = [];
      if (addr.addr_house_no) parts.push(addr.addr_house_no);
      if (addr.addr_village) parts.push(`หมู่บ้าน${addr.addr_village}`);
      if (addr.addr_street) parts.push(`ถนน${addr.addr_street}`);
      if (addr.addr_sub_district) parts.push(`แขวง/ตำบล${addr.addr_sub_district}`);
      if (addr.addr_district) parts.push(`เขต/อำเภอ${addr.addr_district}`);
      if (addr.addr_province) parts.push(addr.addr_province);
      if (addr.addr_postcode) parts.push(addr.addr_postcode);
      return parts.join(' ');
    };

    // Format national ID
    const formatNationalId = (id: string) => {
      if (!id || id.length !== 13) return id;
      return `${id[0]}-${id.substring(1, 5)}-${id.substring(5, 10)}-${id.substring(10, 12)}-${id[12]}`;
    };

    // Prepare ticket data
    const pawnerFull = {
      name: `${contract.pawner?.firstname || ''} ${contract.pawner?.lastname || ''}`,
      idCard: formatNationalId(contract.pawner?.national_id || ''),
      address: formatAddress(contract.pawner || {}),
      phone: contract.pawner?.phone_number || '',
      signatureUrl: contract.pawner?.signature_url || null
    };

    const investorFull = {
      name: `${contract.investor?.firstname || ''} ${contract.investor?.lastname || ''}`,
      idCard: formatNationalId(contract.investor?.national_id || ''),
      address: formatAddress(contract.investor || {}),
      phone: contract.investor?.phone_number || '',
      bankName: contract.investor?.bank_name || '',
      bankAccountNo: contract.investor?.bank_account_no || '',
      bankAccountName: contract.investor?.bank_account_name || ''
    };

    const redactedPerson = {
      name: 'ไม่เปิดเผย',
      idCard: '-',
      address: '-',
      phone: '',
      signatureUrl: null
    };

    const redactedInvestor = {
      ...redactedPerson,
      bankName: '',
      bankAccountNo: '',
      bankAccountName: ''
    };

    const pawnerData = viewer === 'investor'
      ? redactedPerson
      : viewer === 'pawner'
        ? pawnerFull
        : redactedPerson;

    const investorData = viewer === 'pawner'
      ? redactedInvestor
      : viewer === 'investor'
        ? investorFull
        : redactedInvestor;

    const rawRate = Number(contract.interest_rate || 0);
    const totalMonthlyRate = rawRate > 1 ? rawRate / 100 : rawRate;
    const feeRate = 0.01;
    const interestRatePawner = Math.max(0, totalMonthlyRate - feeRate);
    const durationMonths = (contract.contract_duration_days || 0) / 30;
    const principalBase = contract.original_principal_amount || contract.loan_principal_amount || 0;
    const interestOnly = Math.round(principalBase * interestRatePawner * durationMonths * 100) / 100;
    const feeAmount = Math.round(principalBase * feeRate * durationMonths * 100) / 100;
    const totalInterest = interestOnly + feeAmount;

    const ticketData = {
      shopName: 'Pawnly',
      branch: contract.drop_points?.drop_point_name || 'สำนักงานใหญ่',
      ticketNo: contract.contract_number || contract.contract_id.substring(0, 6).toUpperCase(),
      bookNo: contract.contract_id.substring(0, 2).toUpperCase(),
      date: formatThaiDate(contract.contract_start_date),
      dueDate: formatThaiDate(contract.contract_end_date),
      pawner: pawnerData,
      investor: investorData,
      items: contract.items ? [
        {
          seq: 1,
          description: formatItemDescription(contract.items),
          serial: contract.items.serial_number ? `S/N: ${contract.items.serial_number}` : ''
        }
      ] : [],
      amount: contract.loan_principal_amount?.toLocaleString('th-TH', { minimumFractionDigits: 2 }) || '0.00',
      amountText: numberToThaiText(contract.loan_principal_amount || 0),
      interestRate: `${(interestRatePawner * 100).toFixed(2)}% + ${(feeRate * 100).toFixed(2)}% ต่อเดือน`,
      totalAmount: (principalBase + totalInterest)?.toLocaleString('th-TH', { minimumFractionDigits: 2 }) || '0.00',
      interestAmount: totalInterest?.toLocaleString('th-TH', { minimumFractionDigits: 2 }) || '0.00',
      interestAmountInterest: interestOnly?.toLocaleString('th-TH', { minimumFractionDigits: 2 }) || '0.00',
      interestAmountFee: feeAmount?.toLocaleString('th-TH', { minimumFractionDigits: 2 }) || '0.00',
      contractDuration: contract.contract_duration_days || 0,
      contractStatus: contract.contract_status,
      pawnTicketUrl: contract.pawn_ticket_url || null
    };

    return NextResponse.json({
      success: true,
      ticketData,
      contractId: contract.contract_id
    });

  } catch (error: any) {
    console.error('Error fetching pawn ticket data:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
