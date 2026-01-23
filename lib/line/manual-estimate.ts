import { FlexMessage, FlexBubble } from '@line/bot-sdk';

type ManualEstimateItemData = {
  itemType?: string;
  brand?: string;
  model?: string;
  capacity?: string;
  color?: string;
  screenSize?: string;
  watchSize?: string;
  watchConnectivity?: string;
  accessories?: string;
  pawnerCondition?: number;
  condition?: number;
  appleCategory?: string;
  appleSpecs?: string;
  cpu?: string;
  ram?: string;
  storage?: string;
  gpu?: string;
  lenses?: string[];
  defects?: string;
  note?: string;
};

const formatCondition = (value?: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return `${Math.round(value)}%`;
};

const buildSummaryRows = (itemData: ManualEstimateItemData) => {
  const rows: Array<{ label: string; value: string }> = [];

  if (itemData.itemType) rows.push({ label: 'ประเภท', value: itemData.itemType });
  const name = [itemData.brand, itemData.model].filter(Boolean).join(' ');
  if (name) rows.push({ label: 'รุ่น', value: name });
  if (itemData.capacity) rows.push({ label: 'ความจุ', value: itemData.capacity });
  if (itemData.color) rows.push({ label: 'สี', value: itemData.color });
  if (itemData.cpu) rows.push({ label: 'CPU', value: itemData.cpu });
  if (itemData.ram) rows.push({ label: 'RAM', value: itemData.ram });
  if (itemData.storage) rows.push({ label: 'Storage', value: itemData.storage });
  if (itemData.gpu) rows.push({ label: 'GPU', value: itemData.gpu });
  if (itemData.watchSize) rows.push({ label: 'ขนาดนาฬิกา', value: itemData.watchSize });
  if (itemData.watchConnectivity) rows.push({ label: 'การเชื่อมต่อ', value: itemData.watchConnectivity });
  if (itemData.screenSize) rows.push({ label: 'ขนาดจอ', value: itemData.screenSize });
  if (itemData.appleCategory) rows.push({ label: 'หมวด Apple', value: itemData.appleCategory });
  if (itemData.appleSpecs) rows.push({ label: 'สเปค', value: itemData.appleSpecs });

  const conditionValue = formatCondition(itemData.pawnerCondition ?? itemData.condition);
  rows.push({ label: 'สภาพลูกค้า', value: conditionValue });

  return rows;
};

export function createManualEstimateRequestMessage(options: {
  requestId: string;
  itemData: ManualEstimateItemData;
  imageUrls?: string[];
}) {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_ADMIN_ESTIMATE || '';
  const detailUrl = liffId
    ? `https://liff.line.me/${liffId}?requestId=${encodeURIComponent(options.requestId)}`
    : '';

  const summaryRows = buildSummaryRows(options.itemData);
  const heroImage = options.imageUrls?.find((url) => typeof url === 'string' && url.trim().length > 0);

  const bubble: FlexBubble = {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: 'คำขอประเมินราคา',
          weight: 'bold',
          color: '#ffffff',
          size: 'lg',
        },
        {
          type: 'text',
          text: 'Manual review needed',
          color: '#ffffff',
          size: 'sm',
          margin: 'sm',
        },
      ],
      backgroundColor: '#C0562F',
      paddingAll: 'lg',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: 'มีคำขอประเมินใหม่จากลูกค้า',
          wrap: true,
          size: 'md',
          color: '#333333',
        },
        {
          type: 'separator',
          margin: 'lg',
        },
        {
          type: 'box',
          layout: 'vertical',
          margin: 'lg',
          spacing: 'sm',
          contents: summaryRows.map((row) => ({
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            contents: [
              {
                type: 'text',
                text: `${row.label}:`,
                color: '#666666',
                size: 'sm',
                flex: 3,
              },
              {
                type: 'text',
                text: row.value || '-',
                wrap: true,
                color: '#333333',
                size: 'sm',
                flex: 7,
              },
            ],
          })),
        },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        {
          type: 'button',
          action: {
            type: 'uri',
            label: 'เปิดรายละเอียด',
            uri: detailUrl || 'https://line.me',
          },
          style: 'primary',
          color: '#C0562F',
        },
      ],
    },
  };

  if (heroImage) {
    bubble.hero = {
      type: 'image',
      url: heroImage,
      size: 'full',
      aspectRatio: '1:1',
      aspectMode: 'cover',
    };
  }

  const message: FlexMessage = {
    type: 'flex',
    altText: 'คำขอประเมินราคาใหม่',
    contents: bubble,
  };

  return message;
}
