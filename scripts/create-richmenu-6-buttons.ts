import { Client } from '@line/bot-sdk';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || '',
});

// LIFF IDs for each endpoint
const LIFF_ID_REGISTER = process.env.LIFF_ID_REGISTER || '2008216710-BEZ5XNyd';
const LIFF_ID_PAWN = process.env.LIFF_ID_PAWN || '2008216710-54P86MRY';
const LIFF_ID_CONTRACTS = process.env.LIFF_ID_CONTRACTS || '2008216710-WJXR6xOM';

async function deleteOldRichMenus() {
  try {
    const response = await client.getRichMenuList();
    console.log(`Found ${response.length} existing Rich Menus`);

    for (const menu of response) {
      console.log(`Deleting Rich Menu: ${menu.richMenuId} (${menu.name})`);
      await client.deleteRichMenu(menu.richMenuId);
    }

    console.log('✅ Deleted all old Rich Menus\n');
  } catch (error: any) {
    console.error('Error deleting old Rich Menus:', error.message);
  }
}

async function createRichMenuForMembers() {
  try {
    const richMenu = await client.createRichMenu({
      size: {
        width: 2500,
        height: 1686,
      },
      selected: true,
      name: 'Rich Menu สมาชิก - 6 ปุ่ม',
      chatBarText: 'เมนู',
      areas: [
        // แถวบน - 3 ช่อง
        {
          // ซ้ายบน: สถานะสัญญา
          bounds: { x: 0, y: 0, width: 833, height: 843 },
          action: {
            type: 'uri',
            uri: `https://liff.line.me/${LIFF_ID_CONTRACTS}/contracts`
          },
        },
        {
          // กลางบน: ประวัติการจำนำ
          bounds: { x: 833, y: 0, width: 834, height: 843 },
          action: {
            type: 'uri',
            uri: `https://liff.line.me/${LIFF_ID_CONTRACTS}/contracts/history`
          },
        },
        {
          // ขวาบน: จำนำ
          bounds: { x: 1667, y: 0, width: 833, height: 843 },
          action: {
            type: 'uri',
            uri: `https://liff.line.me/${LIFF_ID_PAWN}/pawn/new`
          },
        },
        // แถวล่าง - 3 ช่อง
        {
          // ซ้ายล่าง: รายการจำนำ
          bounds: { x: 0, y: 843, width: 833, height: 843 },
          action: {
            type: 'uri',
            uri: `https://liff.line.me/${LIFF_ID_CONTRACTS}/contracts`
          },
        },
        {
          // กลางล่าง: แสกน QR Code
          bounds: { x: 833, y: 843, width: 834, height: 843 },
          action: {
            type: 'message',
            text: 'แสกน QR Code'
          },
        },
        {
          // ขวาล่าง: ช่วยเหลือ
          bounds: { x: 1667, y: 843, width: 833, height: 843 },
          action: {
            type: 'message',
            text: 'ติดต่อเรา'
          },
        },
      ],
    });

    console.log('✅ สร้าง Rich Menu สมาชิก (6 ปุ่ม) สำเร็จ');
    console.log('Rich Menu ID:', richMenu);
    return richMenu;
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    return null;
  }
}

async function createRichMenuForNewUsers() {
  try {
    const richMenu = await client.createRichMenu({
      size: {
        width: 2500,
        height: 1686,
      },
      selected: true,
      name: 'Rich Menu สำหรับผู้ใช้ใหม่',
      chatBarText: 'เมนู',
      areas: [
        {
          bounds: {
            x: 0,
            y: 0,
            width: 2500,
            height: 1686,
          },
          action: {
            type: 'uri',
            uri: `https://liff.line.me/${LIFF_ID_REGISTER}/register`,
          },
        },
      ],
    });

    console.log('✅ สร้าง Rich Menu สำหรับผู้ใช้ใหม่สำเร็จ');
    console.log('Rich Menu ID:', richMenu);
    return richMenu;
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    return null;
  }
}

async function main() {
  console.log('🚀 เริ่มสร้าง Rich Menu 6 ปุ่มสำหรับ Production\n');

  // ลบ Rich Menu เก่าทั้งหมด
  await deleteOldRichMenus();

  // สร้างใหม่
  const newUserRichMenuId = await createRichMenuForNewUsers();
  const memberRichMenuId = await createRichMenuForMembers();

  console.log('\n📋 สรุป Rich Menu IDs:');
  if (newUserRichMenuId) {
    console.log(`RICH_MENU_ID_NEW_USER=${newUserRichMenuId}`);
    console.log(`\nอัปโหลดรูป Rich Menu ผู้ใช้ใหม่:`);
    console.log(`curl -X POST https://api-data.line.me/v2/bot/richmenu/${newUserRichMenuId}/content \\`);
    console.log(`  -H "Authorization: Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}" \\`);
    console.log(`  -H "Content-Type: image/png" \\`);
    console.log(`  --data-binary "@/Users/piw/Downloads/pawnline/r1.jpeg"`);
    console.log(`\nตั้งเป็น Default:`);
    console.log(`curl -X POST https://api.line.me/v2/bot/user/all/richmenu/${newUserRichMenuId} \\`);
    console.log(`  -H "Authorization: Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}"`);
  }
  if (memberRichMenuId) {
    console.log(`\nRICH_MENU_ID_MEMBER=${memberRichMenuId}`);
    console.log(`\nอัปโหลดรูป Rich Menu สมาชิก (6 ปุ่ม):`);
    console.log(`curl -X POST https://api-data.line.me/v2/bot/richmenu/${memberRichMenuId}/content \\`);
    console.log(`  -H "Authorization: Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}" \\`);
    console.log(`  -H "Content-Type: image/png" \\`);
    console.log(`  --data-binary "@/Users/piw/Downloads/pawnline/1..png"`);
  }

  console.log('\n\n📝 Rich Menu Layout (2500x1686):');
  console.log('┌─────────────┬─────────────┬─────────────┐');
  console.log('│  สถานะ      │  ประวัติ    │   จำนำ      │');
  console.log('│  สัญญา      │  การจำนำ    │             │');
  console.log('│ (0,0)       │ (833,0)     │ (1667,0)    │');
  console.log('│ 833x843     │ 834x843     │ 833x843     │');
  console.log('├─────────────┼─────────────┼─────────────┤');
  console.log('│  รายการ     │   QR Code   │  ช่วยเหลือ  │');
  console.log('│  จำนำ       │   คิว       │             │');
  console.log('│ (0,843)     │ (833,843)   │ (1667,843)  │');
  console.log('│ 833x843     │ 834x843     │ 833x843     │');
  console.log('└─────────────┴─────────────┴─────────────┘');
}

main();
