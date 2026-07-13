import { Client } from '@line/bot-sdk';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || '',
});

async function createRichMenuForNewUsers() {
  try {
    // Create Rich Menu for New Users
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
            uri: `${process.env.NEXT_PUBLIC_BASE_URL}/register`,
          },
        },
      ],
    });

    console.log('✅ สร้าง Rich Menu สำหรับผู้ใช้ใหม่สำเร็จ');
    console.log('Rich Menu ID:', richMenu);
    console.log('กรุณาเพิ่ม Rich Menu ID นี้ลงใน .env เป็น RICH_MENU_ID_NEW_USER');
    console.log('');

    // TODO: อัปโหลดรูปภาพ Rich Menu
    console.log('📝 ขั้นตอนต่อไป: อัปโหลดรูปภาพ Rich Menu ด้วยคำสั่ง:');
    console.log(`curl -X POST https://api-data.line.me/v2/bot/richmenu/${richMenu}/content \\`);
    console.log(`  -H "Authorization: Bearer YOUR_CHANNEL_ACCESS_TOKEN" \\`);
    console.log(`  -H "Content-Type: image/png" \\`);
    console.log(`  --data-binary "@path/to/richmenu-new-user.png"`);
    console.log('');

    // Set as default Rich Menu (skip for now - need to upload image first)
    // await client.setDefaultRichMenu(richMenu);
    console.log('⚠️  ยังไม่สามารถตั้งเป็น default ได้ - ต้องอัปโหลดรูปก่อน');
    console.log('');

    return richMenu;
  } catch (error: any) {
    console.error('❌ เกิดข้อผิดพลาดในการสร้าง Rich Menu สำหรับผู้ใช้ใหม่:', error.message);
    return null;
  }
}

async function createRichMenuForMembers() {
  try {
    // Create Rich Menu for Members
    const richMenu = await client.createRichMenu({
      size: {
        width: 2500,
        height: 1686,
      },
      selected: true,
      name: 'Rich Menu สำหรับสมาชิก',
      chatBarText: 'เมนู',
      areas: [
        {
          // จำนำ (ซ้าย)
          bounds: {
            x: 0,
            y: 0,
            width: 833,
            height: 843,
          },
          action: {
            type: 'uri',
            uri: `${process.env.NEXT_PUBLIC_BASE_URL}/pawn/new`,
          },
        },
        {
          // สถานะสัญญา (กลาง)
          bounds: {
            x: 833,
            y: 0,
            width: 834,
            height: 843,
          },
          action: {
            type: 'uri',
            uri: `${process.env.NEXT_PUBLIC_BASE_URL}/contracts`,
          },
        },
        {
          // ประวัติการจำนำ (ขวา)
          bounds: {
            x: 1667,
            y: 0,
            width: 833,
            height: 843,
          },
          action: {
            type: 'uri',
            uri: `${process.env.NEXT_PUBLIC_BASE_URL}/contracts/history`,
          },
        },
        {
          // รายการจำนำ (ล่างซ้าย)
          bounds: {
            x: 0,
            y: 843,
            width: 1250,
            height: 843,
          },
          action: {
            type: 'uri',
            uri: `${process.env.NEXT_PUBLIC_BASE_URL}/pawn/list`,
          },
        },
        {
          // ติดต่อเรา (ล่างขวา)
          bounds: {
            x: 1250,
            y: 843,
            width: 1250,
            height: 843,
          },
          action: {
            type: 'message',
            text: 'ติดต่อเรา',
          },
        },
      ],
    });

    console.log('✅ สร้าง Rich Menu สำหรับสมาชิกสำเร็จ');
    console.log('Rich Menu ID:', richMenu);
    console.log('กรุณาเพิ่ม Rich Menu ID นี้ลงใน .env เป็น RICH_MENU_ID_MEMBER');
    console.log('');

    // TODO: อัปโหลดรูปภาพ Rich Menu
    console.log('📝 ขั้นตอนต่อไป: อัปโหลดรูปภาพ Rich Menu ด้วยคำสั่ง:');
    console.log(`curl -X POST https://api-data.line.me/v2/bot/richmenu/${richMenu}/content \\`);
    console.log(`  -H "Authorization: Bearer YOUR_CHANNEL_ACCESS_TOKEN" \\`);
    console.log(`  -H "Content-Type: image/png" \\`);
    console.log(`  --data-binary "@path/to/richmenu-member.png"`);
    console.log('');

    return richMenu;
  } catch (error: any) {
    console.error('❌ เกิดข้อผิดพลาดในการสร้าง Rich Menu สำหรับสมาชิก:', error.message);
    return null;
  }
}

async function main() {
  console.log('🚀 เริ่มต้นการตั้งค่า Rich Menu...\n');

  const newUserRichMenuId = await createRichMenuForNewUsers();
  const memberRichMenuId = await createRichMenuForMembers();

  console.log('✅ สร้าง Rich Menu เสร็จสิ้น!');
  console.log('');
  console.log('📋 สรุป Rich Menu IDs:');
  if (newUserRichMenuId) {
    console.log(`RICH_MENU_ID_NEW_USER=${newUserRichMenuId}`);
  }
  if (memberRichMenuId) {
    console.log(`RICH_MENU_ID_MEMBER=${memberRichMenuId}`);
  }
  console.log('');
  console.log('กรุณาคัดลอกค่าเหล่านี้ไปใส่ในไฟล์ .env.local');
}

// Run the script
main();
