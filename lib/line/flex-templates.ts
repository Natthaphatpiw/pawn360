import { FlexMessage, FlexBubble } from '@line/bot-sdk';

/**
 * Creates a Flex Message with QR code for payment
 */
export function createQRCodeFlexMessage(
  qrCodeUrl: string,
  message: string,
  notificationId: string,
  amount: number,
  actionType: 'redemption' | 'extension'
): FlexMessage {
  const actionText = actionType === 'redemption' ? 'ไถ่ถอนสัญญา' : 'ต่อดอกเบี้ย';

  const bubble: FlexBubble = {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '✅ คำขอได้รับการยืนยัน',
          weight: 'bold',
          color: '#ffffff',
          size: 'lg'
        },
        {
          type: 'text',
          text: actionText,
          color: '#ffffff',
          size: 'sm',
          margin: 'sm'
        }
      ],
      backgroundColor: '#1DB446',
      paddingAll: 'lg'
    },
    hero: {
      type: 'image',
      url: qrCodeUrl,
      size: 'full',
      aspectRatio: '1:1',
      aspectMode: 'cover'
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: message,
          wrap: true,
          size: 'md',
          color: '#333333'
        },
        {
          type: 'separator',
          margin: 'lg'
        },
        {
          type: 'box',
          layout: 'vertical',
          margin: 'lg',
          spacing: 'sm',
          contents: [
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                {
                  type: 'text',
                  text: 'จำนวนเงิน:',
                  color: '#666666',
                  size: 'sm',
                  flex: 2
                },
                {
                  type: 'text',
                  text: `${amount.toLocaleString()} บาท`,
                  wrap: true,
                  color: '#E91E63',
                  size: 'xl',
                  flex: 5,
                  weight: 'bold'
                }
              ]
            }
          ]
        },
        {
          type: 'separator',
          margin: 'lg'
        },
        {
          type: 'text',
          text: '📌 กรุณาสแกน QR Code เพื่อชำระเงิน',
          size: 'sm',
          color: '#999999',
          margin: 'lg',
          wrap: true
        }
      ]
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          action: {
            type: 'postback',
            label: 'อัพโหลดสลิปการโอน',
            data: `action=upload_slip&notificationId=${notificationId}`,
            displayText: 'อัพโหลดสลิปการโอน'
          },
          style: 'primary',
          color: '#1DB446',
          height: 'sm'
        }
      ],
      spacing: 'sm',
      paddingAll: 'lg'
    }
  };

  return {
    type: 'flex',
    altText: `✅ ${actionText} - คำขอได้รับการยืนยัน`,
    contents: bubble
  };
}

/**
 * Creates a rejection message
 */
export function createRejectionFlexMessage(
  message: string,
  actionType: 'redemption' | 'extension'
): FlexMessage {
  const actionText = actionType === 'redemption' ? 'ไถ่ถอนสัญญา' : 'ต่อดอกเบี้ย';

  const bubble: FlexBubble = {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '❌ คำขอไม่ได้รับการยืนยัน',
          weight: 'bold',
          color: '#ffffff',
          size: 'lg'
        },
        {
          type: 'text',
          text: actionText,
          color: '#ffffff',
          size: 'sm',
          margin: 'sm'
        }
      ],
      backgroundColor: '#EF4444',
      paddingAll: 'lg'
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: message,
          wrap: true,
          size: 'md',
          color: '#333333'
        },
        {
          type: 'separator',
          margin: 'lg'
        },
        {
          type: 'text',
          text: '💡 กรุณาติดต่อร้านค้าเพื่อสอบถามข้อมูลเพิ่มเติม',
          size: 'sm',
          color: '#999999',
          margin: 'lg',
          wrap: true
        }
      ]
    }
  };

  return {
    type: 'flex',
    altText: `❌ ${actionText} - คำขอไม่ได้รับการยืนยัน`,
    contents: bubble
  };
}

/**
 * Creates a payment success message
 */
export function createPaymentSuccessFlexMessage(
  message: string,
  actionType: 'redemption' | 'extension',
  contractNumber: string
): FlexMessage {
  const actionText = actionType === 'redemption' ? 'ไถ่ถอนสัญญา' : 'ต่อดอกเบี้ย';

  const bubble: FlexBubble = {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '✅ ชำระเงินสำเร็จ',
          weight: 'bold',
          color: '#ffffff',
          size: 'xl'
        }
      ],
      backgroundColor: '#1DB446',
      paddingAll: 'lg'
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: message,
          wrap: true,
          size: 'md',
          color: '#333333'
        },
        {
          type: 'separator',
          margin: 'lg'
        },
        {
          type: 'box',
          layout: 'vertical',
          margin: 'lg',
          spacing: 'sm',
          contents: [
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                {
                  type: 'text',
                  text: 'เลขสัญญา:',
                  color: '#666666',
                  size: 'sm',
                  flex: 2
                },
                {
                  type: 'text',
                  text: contractNumber,
                  wrap: true,
                  color: '#333333',
                  size: 'sm',
                  flex: 5,
                  weight: 'bold'
                }
              ]
            },
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                {
                  type: 'text',
                  text: 'รายการ:',
                  color: '#666666',
                  size: 'sm',
                  flex: 2
                },
                {
                  type: 'text',
                  text: actionText,
                  wrap: true,
                  color: '#1DB446',
                  size: 'sm',
                  flex: 5,
                  weight: 'bold'
                }
              ]
            }
          ]
        },
        {
          type: 'separator',
          margin: 'lg'
        },
        {
          type: 'text',
          text: actionType === 'redemption'
            ? '🎉 คุณสามารถมารับสินค้าได้ที่ร้านแล้ว'
            : '✨ สัญญาของคุณได้รับการต่ออายุแล้ว',
          size: 'sm',
          color: '#999999',
          margin: 'lg',
          wrap: true
        }
      ]
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          action: {
            type: 'uri',
            label: 'ดูรายละเอียดสัญญา',
            uri: `https://pawn360.vercel.app/contracts`
          },
          style: 'link',
          height: 'sm'
        }
      ]
    }
  };

  return {
    type: 'flex',
    altText: '✅ ชำระเงินสำเร็จ',
    contents: bubble
  };
}

/**
 * Creates a payment failure message
 */
export function createPaymentFailureFlexMessage(
  message: string,
  actionType: 'redemption' | 'extension'
): FlexMessage {
  const actionText = actionType === 'redemption' ? 'ไถ่ถอนสัญญา' : 'ต่อดอกเบี้ย';

  const bubble: FlexBubble = {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '❌ การชำระเงินไม่สำเร็จ',
          weight: 'bold',
          color: '#ffffff',
          size: 'lg'
        }
      ],
      backgroundColor: '#EF4444',
      paddingAll: 'lg'
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: message,
          wrap: true,
          size: 'md',
          color: '#333333'
        },
        {
          type: 'separator',
          margin: 'lg'
        },
        {
          type: 'text',
          text: '💡 กรุณาตรวจสอบสลิปการโอนเงินและลองใหม่อีกครั้ง หรือติดต่อร้านค้า',
          size: 'sm',
          color: '#999999',
          margin: 'lg',
          wrap: true
        }
      ]
    }
  };

  return {
    type: 'flex',
    altText: '❌ การชำระเงินไม่สำเร็จ',
    contents: bubble
  };
}

/**
 * Creates a pending approval message (after customer sends request)
 */
export function createPendingApprovalMessage(
  actionType: 'redemption' | 'extension',
  contractNumber: string
): FlexMessage {
  const actionText = actionType === 'redemption' ? 'ไถ่ถอนสัญญา' : 'ต่อดอกเบี้ย';

  const bubble: FlexBubble = {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '⏳ รอการอนุมัติ',
          weight: 'bold',
          color: '#ffffff',
          size: 'lg'
        }
      ],
      backgroundColor: '#F59E0B',
      paddingAll: 'lg'
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: `คำขอ${actionText}ของคุณถูกส่งไปยังร้านค้าเรียบร้อยแล้ว`,
          wrap: true,
          size: 'md',
          color: '#333333'
        },
        {
          type: 'separator',
          margin: 'lg'
        },
        {
          type: 'box',
          layout: 'vertical',
          margin: 'lg',
          spacing: 'sm',
          contents: [
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                {
                  type: 'text',
                  text: 'เลขสัญญา:',
                  color: '#666666',
                  size: 'sm',
                  flex: 2
                },
                {
                  type: 'text',
                  text: contractNumber,
                  wrap: true,
                  color: '#333333',
                  size: 'sm',
                  flex: 5,
                  weight: 'bold'
                }
              ]
            },
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                {
                  type: 'text',
                  text: 'รายการ:',
                  color: '#666666',
                  size: 'sm',
                  flex: 2
                },
                {
                  type: 'text',
                  text: actionText,
                  wrap: true,
                  color: '#F59E0B',
                  size: 'sm',
                  flex: 5,
                  weight: 'bold'
                }
              ]
            }
          ]
        },
        {
          type: 'separator',
          margin: 'lg'
        },
        {
          type: 'text',
          text: '💡 พนักงานร้านจะดำเนินการภายใน 24 ชั่วโมง คุณจะได้รับการแจ้งเตือนเมื่อคำขอได้รับการอนุมัติ',
          size: 'sm',
          color: '#999999',
          margin: 'lg',
          wrap: true
        }
      ]
    }
  };

  return {
    type: 'flex',
    altText: `⏳ รอการอนุมัติ - ${actionText}`,
    contents: bubble
  };
}
