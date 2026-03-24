import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { splitItemNotesAndPasscode } from '@/lib/utils/item-private-notes';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const buildTicketPdfHtml = (ticketData: any) => {
  const items = Array.isArray(ticketData?.items) ? ticketData.items : [];
  const pawnerSignatureUrl = ticketData?.pawner?.signatureUrl ? escapeHtml(ticketData.pawner.signatureUrl) : '';
  const itemsHtml = items.length > 0
    ? items.map((item: any, index: number) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(item?.description || '-')}</td>
          <td>${escapeHtml(item?.serial || '-')}</td>
        </tr>
      `).join('')
    : `
      <tr>
        <td>1</td>
        <td>-</td>
        <td>-</td>
      </tr>
    `;

  const pawnerSignatureHtml = pawnerSignatureUrl
    ? `<img src="${pawnerSignatureUrl}" alt="Pawner signature" style="max-height: 64px; max-width: 100%; object-fit: contain;" />`
    : '';

  return `<!DOCTYPE html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <title>Loan Contract ${escapeHtml(ticketData?.ticketNo || '')}</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 32px;
        font-family: "Noto Sans Thai", "Helvetica Neue", Arial, sans-serif;
        color: #1f2937;
        background: #f3f4f6;
      }
      .page {
        width: 100%;
        background: #ffffff;
        border: 1px solid #dbe3ef;
        border-radius: 24px;
        overflow: hidden;
      }
      .header {
        background: linear-gradient(135deg, #1e3a8a, #244caa);
        color: #ffffff;
        padding: 28px 32px;
      }
      .header-row {
        display: flex;
        justify-content: space-between;
        gap: 24px;
        align-items: flex-start;
      }
      .brand {
        font-size: 26px;
        font-weight: 700;
      }
      .muted {
        font-size: 12px;
        opacity: 0.9;
      }
      .badge {
        display: inline-block;
        padding: 6px 12px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.18);
        font-size: 12px;
        font-weight: 700;
      }
      .content {
        padding: 28px 32px 32px;
      }
      .section {
        margin-bottom: 22px;
      }
      .section-title {
        margin: 0 0 12px;
        font-size: 14px;
        font-weight: 700;
        color: #1e3a8a;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }
      .grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
      }
      .card {
        border: 1px solid #e5e7eb;
        border-radius: 18px;
        padding: 16px;
        background: #fafafa;
      }
      .row {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 8px;
        font-size: 13px;
      }
      .row:last-child { margin-bottom: 0; }
      .label { color: #6b7280; }
      .value {
        font-weight: 600;
        text-align: right;
        white-space: pre-wrap;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }
      th, td {
        border: 1px solid #e5e7eb;
        padding: 10px 12px;
        vertical-align: top;
      }
      th {
        background: #eff6ff;
        color: #1e3a8a;
        text-align: left;
        font-weight: 700;
      }
      .summary {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
      }
      .summary-card {
        border-radius: 18px;
        padding: 14px 16px;
        background: #eef4ff;
        border: 1px solid #d7e4ff;
      }
      .summary-card.total {
        background: #e7f8ee;
        border-color: #c7efd5;
      }
      .summary-label {
        font-size: 12px;
        color: #6b7280;
        margin-bottom: 6px;
      }
      .summary-value {
        font-size: 20px;
        font-weight: 700;
        color: #1e3a8a;
      }
      .summary-card.total .summary-value { color: #166534; }
      .note {
        font-size: 11px;
        color: #4b5563;
        line-height: 1.7;
      }
      .footer {
        margin-top: 28px;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 24px;
      }
      .signature {
        height: 72px;
        border-bottom: 1px dashed #9ca3af;
        margin-bottom: 8px;
      }
      .signature-label {
        font-size: 11px;
        color: #6b7280;
        text-align: center;
      }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="header">
        <div class="header-row">
          <div>
            <div class="brand">${escapeHtml(ticketData?.shopName || 'Pawnly')}</div>
            <div class="muted">${escapeHtml(ticketData?.branch || '-')}</div>
          </div>
          <div style="text-align: right;">
            <div class="badge">สัญญาสินเชื่อ / Loan Contract</div>
            <div class="muted" style="margin-top: 10px;">เลขที่ ${escapeHtml(ticketData?.ticketNo || '-')}</div>
            <div class="muted">เล่มที่ ${escapeHtml(ticketData?.bookNo || '-')}</div>
          </div>
        </div>
      </div>

      <div class="content">
        <div class="section">
          <div class="grid">
            <div class="card">
              <div class="row"><span class="label">วันที่ทำรายการ</span><span class="value">${escapeHtml(ticketData?.date || '-')}</span></div>
              <div class="row"><span class="label">วันครบกำหนด</span><span class="value">${escapeHtml(ticketData?.dueDate || '-')}</span></div>
            </div>
            <div class="card">
              <div class="row"><span class="label">สถานะ</span><span class="value">${escapeHtml(ticketData?.contractStatus || '-')}</span></div>
              <div class="row"><span class="label">ระยะเวลา</span><span class="value">${escapeHtml(ticketData?.contractDuration || 0)} วัน</span></div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">ข้อมูลคู่สัญญา</div>
          <div class="grid">
            <div class="card">
              <div class="row"><span class="label">ผู้ขอสินเชื่อ</span><span class="value">${escapeHtml(ticketData?.pawner?.name || '-')}</span></div>
              <div class="row"><span class="label">เลขบัตรประชาชน</span><span class="value">${escapeHtml(ticketData?.pawner?.idCard || '-')}</span></div>
              <div class="row"><span class="label">โทรศัพท์</span><span class="value">${escapeHtml(ticketData?.pawner?.phone || '-')}</span></div>
              <div class="row"><span class="label">ที่อยู่</span><span class="value">${escapeHtml(ticketData?.pawner?.address || '-')}</span></div>
            </div>
            <div class="card">
              <div class="row"><span class="label">ผู้ลงทุน</span><span class="value">${escapeHtml(ticketData?.investor?.name || '-')}</span></div>
              <div class="row"><span class="label">เลขบัตรประชาชน</span><span class="value">${escapeHtml(ticketData?.investor?.idCard || '-')}</span></div>
              <div class="row"><span class="label">โทรศัพท์</span><span class="value">${escapeHtml(ticketData?.investor?.phone || '-')}</span></div>
              <div class="row"><span class="label">ที่อยู่</span><span class="value">${escapeHtml(ticketData?.investor?.address || '-')}</span></div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">ทรัพย์สินค้ำประกัน</div>
          <table>
            <thead>
              <tr>
                <th style="width: 56px;">ลำดับ</th>
                <th>รายละเอียด</th>
                <th style="width: 180px;">Serial</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
        </div>

        <div class="section">
          <div class="section-title">สรุปยอด</div>
          <div class="summary">
            <div class="summary-card">
              <div class="summary-label">เงินต้น</div>
              <div class="summary-value">${escapeHtml(ticketData?.amount || '0.00')}</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">ดอกเบี้ยรวม</div>
              <div class="summary-value">${escapeHtml(ticketData?.interestAmount || '0.00')}</div>
            </div>
            <div class="summary-card total">
              <div class="summary-label">รวมรับคืน</div>
              <div class="summary-value">${escapeHtml(ticketData?.totalAmount || '0.00')}</div>
            </div>
          </div>
          <div class="card" style="margin-top: 12px;">
            <div class="row"><span class="label">อัตราดอกเบี้ย</span><span class="value">${escapeHtml(ticketData?.interestRate || '-')}</span></div>
            <div class="row"><span class="label">จำนวนเงิน (ตัวอักษร)</span><span class="value">${escapeHtml(ticketData?.amountText || '-')}</span></div>
          </div>
        </div>

        <div class="section note">
          ผู้ขอสินเชื่อตกลงชำระคืนเงินต้นพร้อมดอกเบี้ยภายในกำหนด และผู้ลงทุนตกลงรับสิทธิในทรัพย์สินค้ำประกันตามเงื่อนไขของแพลตฟอร์มเมื่อเกิดการผิดนัดชำระ.
        </div>

        <div class="footer">
          <div>
            <div class="signature">${pawnerSignatureHtml}</div>
            <div class="signature-label">ลงชื่อผู้ขอสินเชื่อ</div>
          </div>
          <div>
            <div class="signature"></div>
            <div class="signature-label">ลงชื่อผู้ลงทุน</div>
          </div>
        </div>
      </div>
    </div>
  </body>
</html>`;
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ contractId: string }> }
) {
  try {
    const { contractId } = await context.params;
    const { searchParams } = new URL(request.url);
    const viewer = searchParams.get('viewer') || 'public';
    const format = (searchParams.get('format') || 'json').toLowerCase();

    if (!contractId) {
      return NextResponse.json(
        { error: 'Contract ID is required' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // Fetch complete contract data for loan contract
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
      signatureUrl: contract.signed_contract_url || contract.pawner?.signature_url || null
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
    const feeRate = Number(contract.platform_fee_rate ?? 0.01);
    const interestRatePawner = totalMonthlyRate;
    const durationMonths = (contract.contract_duration_days || 0) / 30;
    const principalBase = contract.original_principal_amount || contract.loan_principal_amount || 0;
    const interestOnly = Math.round(principalBase * interestRatePawner * durationMonths * 100) / 100;
    const feeAmount = Math.round(principalBase * feeRate * durationMonths * 100) / 100;
    const totalInterest = interestOnly + feeAmount;

    const notesPayload = splitItemNotesAndPasscode(contract.items?.notes);

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
      itemNotes: notesPayload.publicNotes || contract.items?.defects || '',
      contractDuration: contract.contract_duration_days || 0,
      contractStatus: contract.contract_status,
      pawnTicketUrl: contract.pawn_ticket_url || null
    };

    if (format === 'pdf') {
      try {
        const html = buildTicketPdfHtml(ticketData);
        const browser = await puppeteer.launch({
          args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
          executablePath: await chromium.executablePath(),
          headless: true,
        });
        let pdfBuffer: Uint8Array;

        try {
          const page = await browser.newPage();
          await page.setViewport({ width: 1240, height: 1754 });
          await page.setContent(html, { waitUntil: 'domcontentloaded' });
          pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
              top: '16px',
              right: '16px',
              bottom: '16px',
              left: '16px',
            },
          });
        } finally {
          await browser.close();
        }

        const pdfArrayBuffer = Uint8Array.from(pdfBuffer).buffer;

        return new NextResponse(pdfArrayBuffer, {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${ticketData.ticketNo || contractId}.pdf"`,
            'Cache-Control': 'no-store',
          },
        });
      } catch (pdfError: any) {
        console.error('Error generating loan contract PDF:', pdfError);
        return NextResponse.json(
          { error: 'ไม่สามารถสร้างไฟล์ PDF ได้' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      ticketData,
      contractId: contract.contract_id
    });

  } catch (error: any) {
    console.error('Error fetching loan contract data:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
