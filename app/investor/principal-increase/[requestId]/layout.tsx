import { Metadata } from 'next';
import Script from 'next/script';

export const metadata: Metadata = {
  title: 'อนุมัติคำขอเพิ่มเงินต้น',
  description: 'ดูรายละเอียดและอนุมัติคำขอเพิ่มเงินต้น',
};

// LIFF ID = 2008641671-ejsAmBXx
const liffId = process.env.NEXT_PUBLIC_LIFF_ID_INVEST_PRINCIPAL_INCREASE || '2008641671-ejsAmBXx';

export default function InvestorPrincipalIncreaseRequestLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body>
        <Script src="https://static.line-scdn.net/liff/edge/2/sdk.js" strategy="beforeInteractive" />
        <Script
          id="liff-init-principal-increase"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof window !== 'undefined') {
                window.addEventListener('DOMContentLoaded', function () {
                  if (window.liff) {
                    window.liff.init({ liffId: '${liffId}' })
                      .then(() => console.log('LIFF initialized successfully'))
                      .catch((error) => console.error('LIFF initialization failed', error));
                  }
                });
              }
            `,
          }}
        />
        <div className="min-h-screen bg-[#F0F4F8]">
          {children}
        </div>
      </body>
    </html>
  );
}
