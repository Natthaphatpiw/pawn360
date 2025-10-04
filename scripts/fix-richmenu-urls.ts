import { Client } from '@line/bot-sdk';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || '',
});

// ใช้ LIFF ID เดียวกันสำหรับทุกหน้า
const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID || '2008216710-BEZ5XNyd';

async function deleteAllRichMenus() {
  const menus = await client.getRichMenuList();
  for (const menu of menus) {
    console.log(`Deleting: ${menu.richMenuId}`);
    await client.deleteRichMenu(menu.richMenuId);
  }
}

async function createRichMenuNewUser() {
  const richMenu = await client.createRichMenu({
    size: { width: 2500, height: 1686 },
    selected: true,
    name: 'Rich Menu ผู้ใช้ใหม่',
    chatBarText: 'เมนู',
    areas: [{
      bounds: { x: 0, y: 0, width: 2500, height: 1686 },
      action: {
        type: 'uri',
        uri: `https://liff.line.me/${LIFF_ID}/register`,
      },
    }],
  });

  console.log('✅ Rich Menu ผู้ใช้ใหม่:', richMenu);
  return richMenu;
}

async function createRichMenuMember() {
  const richMenu = await client.createRichMenu({
    size: { width: 2500, height: 1686 },
    selected: true,
    name: 'Rich Menu สมาชิก',
    chatBarText: 'เมนู',
    areas: [
      {
        bounds: { x: 0, y: 0, width: 833, height: 843 },
        action: { type: 'uri', uri: `https://liff.line.me/${LIFF_ID}/pawn/new` },
      },
      {
        bounds: { x: 833, y: 0, width: 834, height: 843 },
        action: { type: 'uri', uri: `https://liff.line.me/${LIFF_ID}/contracts` },
      },
      {
        bounds: { x: 1667, y: 0, width: 833, height: 843 },
        action: { type: 'uri', uri: `https://liff.line.me/${LIFF_ID}/contracts` },
      },
      {
        bounds: { x: 0, y: 843, width: 1250, height: 843 },
        action: { type: 'uri', uri: `https://liff.line.me/${LIFF_ID}/contracts` },
      },
      {
        bounds: { x: 1250, y: 843, width: 1250, height: 843 },
        action: { type: 'message', text: 'ติดต่อเรา' },
      },
    ],
  });

  console.log('✅ Rich Menu สมาชิก:', richMenu);
  return richMenu;
}

async function main() {
  console.log(`\n🚀 สร้าง Rich Menu ด้วย LIFF ID: ${LIFF_ID}\n`);

  await deleteAllRichMenus();

  const newUserId = await createRichMenuNewUser();
  const memberId = await createRichMenuMember();

  console.log('\n📋 คำสั่งต่อไป:\n');

  console.log('1. อัปโหลดรูป Rich Menu ผู้ใช้ใหม่:');
  console.log(`curl -X POST https://api-data.line.me/v2/bot/richmenu/${newUserId}/content \\`);
  console.log(`  -H "Authorization: Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}" \\`);
  console.log(`  -H "Content-Type: image/png" \\`);
  console.log(`  --data-binary "@/Users/piw/Downloads/pawnline/r1.jpeg"\n`);

  console.log('2. อัปโหลดรูป Rich Menu สมาชิก:');
  console.log(`curl -X POST https://api-data.line.me/v2/bot/richmenu/${memberId}/content \\`);
  console.log(`  -H "Authorization: Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}" \\`);
  console.log(`  -H "Content-Type: image/png" \\`);
  console.log(`  --data-binary "@/Users/piw/Downloads/pawnline/r2.jpeg"\n`);

  console.log('3. ตั้งเป็น Default:');
  console.log(`curl -X POST https://api.line.me/v2/bot/user/all/richmenu/${newUserId} \\`);
  console.log(`  -H "Authorization: Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}"\n`);

  console.log('4. เพิ่มใน .env.local:');
  console.log(`RICH_MENU_ID_NEW_USER=${newUserId}`);
  console.log(`RICH_MENU_ID_MEMBER=${memberId}`);
}

main();
