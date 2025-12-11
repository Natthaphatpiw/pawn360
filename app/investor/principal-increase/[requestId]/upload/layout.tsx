import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'อัปโหลดสลิปโอนเงิน - Pawn360',
  description: 'อัปโหลดสลิปการโอนเงินสำหรับคำขอเพิ่มเงินต้น',
};

// LIFF ID = 2008641671-ejsAmBXx (same as parent)
const liffId = process.env.NEXT_PUBLIC_LIFF_ID_INVEST_PRINCIPAL_INCREASE || '2008641671-ejsAmBXx';

export default function InvestorPrincipalIncreaseUploadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <head>
        <script
          src={`https://static.line-scdn.net/liff/edge/2/sdk.js`}
          strategy="beforeInteractive"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              document.addEventListener('DOMContentLoaded', function() {
                if (typeof window !== 'undefined' && window.liff) {
                  window.liff.init({
                    liffId: '${liffId}'
                  }).then(() => {
                    console.log('LIFF initialized successfully');
                  }).catch((error) => {
                    console.error('LIFF initialization failed', error);
                  });
                }
              });
            `,
          }}
        />
      </head>
      <body>
        <div className="min-h-screen bg-[#F0F4F8]">
          {children}
        </div>
      </body>
    </html>
  );
}