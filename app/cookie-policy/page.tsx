import Image from 'next/image';
import Link from 'next/link';
import { Montserrat, Noto_Sans_Thai } from 'next/font/google';

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const notoSansThai = Noto_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['200', '300', '400', '500', '600', '700'],
});

export default function CookiePolicyPage() {
  return (
    <div className={`${notoSansThai.className} bg-[var(--bg)] text-[var(--ink)]`}>
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-32 right-[-10%] h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle_at_center,rgba(196,170,148,0.3),rgba(245,244,242,0))]" />
        <div className="pointer-events-none absolute top-[34%] left-[-8%] h-[240px] w-[240px] rounded-full bg-[radial-gradient(circle_at_center,rgba(210,178,150,0.22),rgba(245,244,242,0))]" />

        <header className="mx-auto flex w-full max-w-[1216px] items-center justify-between px-4 py-4 sm:px-6 sm:py-6 lg:px-14">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Image
                src="/landing/pawnly_logo.png"
                alt="Pawnly"
                width={302}
                height={80}
                priority
                className="h-7 w-auto sm:h-8"
              />
            </Link>
          </div>

          <nav className="hidden items-center gap-2 text-xs lg:flex font-semibold">
            <Link href="/">
              <button className="rounded-full bg-transparent px-3 py-1 text-[var(--muted-2)] transition-all duration-300 hover:text-[var(--accent)] hover:scale-105">
                หน้าหลัก
              </button>
            </Link>
            <span className="h-6 w-px bg-[var(--line)]" />
            <Link href="/pawner">
              <button className="px-3 py-1 text-[var(--muted-2)] transition-all duration-300 hover:text-[var(--accent)] hover:scale-105">
                ผู้ขอสินเชื่อ
              </button>
            </Link>
            <span className="h-6 w-px bg-[var(--line)]" />
            <Link href="/investor">
              <button className="px-3 py-1 text-[var(--muted-2)] transition-all duration-300 hover:text-[var(--accent)] hover:scale-105">
                นักลงทุน
              </button>
            </Link>
            <span className="h-6 w-px bg-[var(--line)]" />
            <Link href="/drop-point-page">
              <button className="px-3 py-1 text-[var(--muted-2)] transition-all duration-300 hover:text-[var(--accent)] hover:scale-105">
                จุดรับฝาก
              </button>
            </Link>
            <span className="h-6 w-px bg-[var(--line)]" />
            <Link href="/about">
              <button className="px-3 py-1 text-[var(--muted-2)] transition-all duration-300 hover:text-[var(--accent)] hover:scale-105">
                เกี่ยวกับเรา
              </button>
            </Link>
          </nav>

          <div className={`${montserrat.className} hidden items-center gap-3 lg:flex`}>
            <button className="rounded-full border border-[#999999] px-4 py-1.5 text-xs text-[#686360]">
              Login
            </button>
            <button className="rounded-full bg-[#686360] px-4 py-1.5 text-xs text-[#f5f4f2]">
              Join us
            </button>
          </div>
        </header>

        <section className="mx-auto w-full max-w-[980px] px-4 pb-16 pt-6 sm:px-6 sm:pb-20 lg:px-14">
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-[#686360] sm:text-3xl lg:text-[36px]">นโยบายคุกกี้</h1>
            <p className="mt-2 text-sm text-[#9a9694]">Cookie Policy</p>
          </div>

          <div className="mt-10 space-y-10 text-sm leading-7 text-[#7f7b78]">
            <section>
              <h2 className="text-base font-semibold text-[#686360]">คุกกี้คืออะไร</h2>
              <p className="mt-3">
                คุกกี้ (Cookies) คือไฟล์ขนาดเล็กที่ถูกบันทึกไว้ในอุปกรณ์ของท่านเมื่อท่านเข้าเยี่ยมชมเว็บไซต์หนึ่ง ๆ และคุกกี้จะถูกส่งกลับไปยังเว็บไซต์ต้นทางหรือเว็บไซต์อื่น ๆ ที่อาจจดจำคุกกี้นั้น ๆ ได้ในแต่ละครั้งของการเข้าเยี่ยมชมในครั้งต่อ ๆ มา คุกกี้เหล่านี้มีความสำคัญต่อการทำงานของเว็บไซต์ และบางประเภทอาจเก็บรวบรวมข้อมูลเพื่อปรับปรุงประสบการณ์การใช้งานของท่าน
              </p>
              <p className="mt-3 text-xs text-[#8e8a86]">
                Cookies are small files saved on your device to remember preferences and improve your experience.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-[#686360]">ประเภทของคุกกี้ที่เราใช้</h2>
              <p className="mt-3">
                เราใช้คุกกี้เมื่อท่านได้เข้าเยี่ยมชมเว็บไซต์ของเรา โดยสามารถแบ่งประเภทคุกกี้ตามการใช้งานได้ดังนี้
              </p>
              <ol className="mt-4 list-decimal space-y-2 pl-6 text-[#7f7b78]">
                <li>คุกกี้ประเภทจำเป็นถาวร (Strictly Necessary Cookies)</li>
                <li>คุกกี้เพื่อการทำงานของเว็บไซต์ (Functionality/Preference Cookies)</li>
                <li>คุกกี้เพื่อการวิเคราะห์/เพื่อประสิทธิภาพ (Analytical/Performance Cookies)</li>
              </ol>
              <p className="mt-4 text-xs text-[#8e8a86]">
                รายการคุกกี้ด้านล่างเป็นตัวอย่างเพื่ออธิบายการใช้งานจริงและอาจมีการเปลี่ยนแปลงตามระบบของเรา
              </p>
              <div className="mt-5 overflow-x-auto rounded-2xl border border-[#e0dcd8] bg-white">
                <table className="min-w-[720px] w-full text-left text-xs text-[#7f7b78]">
                  <thead className="bg-[#f0eeec] text-[11px] uppercase text-[#686360]">
                    <tr>
                      <th className="px-4 py-3">ประเภทของคุกกี้</th>
                      <th className="px-4 py-3">ชื่อคุกกี้ (ตัวอย่าง)</th>
                      <th className="px-4 py-3">วัตถุประสงค์</th>
                      <th className="px-4 py-3">ระยะเวลา</th>
                      <th className="px-4 py-3">ผู้ให้บริการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#ece9e6]">
                    <tr>
                      <td className="px-4 py-3">จำเป็นถาวร</td>
                      <td className="px-4 py-3">ci_session, G_ENABLES_IDPS, __utmz, __utma</td>
                      <td className="px-4 py-3">ช่วยให้การใช้งานเว็บไซต์มีเสถียรภาพ เช่น การกรอกข้อมูลในแบบฟอร์ม</td>
                      <td className="px-4 py-3">ลบเมื่อปิดเบราว์เซอร์</td>
                      <td className="px-4 py-3">Pawnly</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3">การทำงานของเว็บไซต์</td>
                      <td className="px-4 py-3">home_popup, compare_1, compare_2, token, phone, email</td>
                      <td className="px-4 py-3">จดจำตัวเลือก เช่น ภาษา ภูมิภาค หรือสถานะการเข้าสู่ระบบ</td>
                      <td className="px-4 py-3">ลบเมื่อปิดเบราว์เซอร์</td>
                      <td className="px-4 py-3">Pawnly</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3">การวิเคราะห์/ประสิทธิภาพ</td>
                      <td className="px-4 py-3">
                        __Secure-3PSIDCC, SAPISID, APISID, SID, SIDCC, NID
                      </td>
                      <td className="px-4 py-3">วิเคราะห์พฤติกรรมการใช้งานเพื่อปรับปรุงประสิทธิภาพเว็บไซต์</td>
                      <td className="px-4 py-3">1 ปี</td>
                      <td className="px-4 py-3">Google Analytics</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="text-base font-semibold text-[#686360]">การจัดการคุกกี้</h2>
              <p className="mt-3">
                ท่านสามารถจัดการการใช้งานคุกกี้ของเว็บไซต์เราได้ตลอดเวลา โดยคลิกที่ไอคอนตั้งค่า และปรับการยอมรับ/ปฏิเสธ จากนั้นกด “บันทึกและปิด”
              </p>
              <p className="mt-3">
                นอกจากนี้ท่านสามารถจัดการการใช้งานคุกกี้ผ่านการตั้งค่าเบราว์เซอร์ได้ที่:
              </p>
              <ul className="mt-3 list-disc space-y-1 pl-6 text-[#7f7b78]">
                <li>Google Chrome</li>
                <li>Microsoft Edge</li>
                <li>Mozilla Firefox</li>
                <li>Safari</li>
                <li>Opera</li>
              </ul>
              <p className="mt-3">
                หากท่านปฏิเสธการใช้งานคุกกี้บางประเภท เว็บไซต์อาจไม่สามารถทำงานได้เต็มประสิทธิภาพตามวัตถุประสงค์ที่กำหนดไว้
              </p>
              <p className="mt-3">
                ท่านสามารถปฏิเสธการใช้ Google Analytics Cookies ในทุกเว็บไซต์ได้ที่{' '}
                <a className="text-[var(--accent)] underline" href="http://tools.google.com/dlpage/gaoptout" target="_blank" rel="noreferrer">
                  http://tools.google.com/dlpage/gaoptout
                </a>
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-[#686360]">การปรับปรุงนโยบายคุกกี้</h2>
              <p className="mt-3">
                นโยบายคุกกี้ฉบับนี้อาจได้รับการแก้ไขปรับปรุงเพื่อให้เป็นไปตามกฎหมายหรือแนวปฏิบัติที่เกี่ยวข้อง เราขอแนะนำให้ท่านตรวจสอบการเปลี่ยนแปลงเป็นครั้งคราว
              </p>
              <p className="mt-3 text-xs text-[#8e8a86]">ปรับปรุงล่าสุด: 1 เมษายน 2565</p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-[#686360]">ช่องทางการติดต่อ</h2>
              <p className="mt-3">
                หากท่านมีข้อสงสัยเกี่ยวกับนโยบายคุกกี้ โปรดติดต่อเราผ่านเว็บไซต์หลักของ Pawnly
              </p>
              <Link href="/" className="mt-3 inline-block text-[var(--accent)] underline">
                ไปที่เว็บไซต์ Pawnly
              </Link>
            </section>
          </div>
        </section>

        <footer className="bg-[#2c2a28] text-[#686360]">
          <div className="mx-auto flex w-full max-w-[1216px] flex-wrap justify-between gap-8 px-4 py-12 sm:gap-10 sm:px-6 sm:py-16 lg:px-14">
            <div className="min-w-[180px] sm:min-w-[220px]">
              <Image
                src="/landing/pawnly_foot.png"
                alt="Pawnly"
                width={600}
                height={96}
                className="h-6 w-auto sm:h-7"
              />
            </div>
            <div className="grid flex-1 grid-cols-2 gap-6 text-xs sm:grid-cols-4 sm:gap-8">
              <div>
                <h5 className={`${montserrat.className} text-sm font-semibold text-[#d0cfce]`}>Approaches</h5>
                <ul className="mt-3 space-y-2">
                  <li>หน้าหลัก</li>
                  <li>ผู้ขอสินเชื่อ</li>
                  <li>นักลงทุน</li>
                  <li>จุดรับฝาก</li>
                </ul>
              </div>
              <div>
                <h5 className={`${montserrat.className} text-sm font-semibold text-[#d0cfce]`}>Company</h5>
                <ul className="mt-3 space-y-2">
                  <li>เกี่ยวกับเรา</li>
                  <li>ติดต่อเรา</li>
                </ul>
              </div>
              <div>
                <h5 className={`${montserrat.className} text-sm font-semibold text-[#d0cfce]`}>Follow us</h5>
                <div className="mt-3 flex gap-2">
                  {[
                    { name: 'Facebook', icon: (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                      </svg>
                    )},
                    { name: 'YouTube', icon: (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                      </svg>
                    )},
                    { name: 'X', icon: (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                      </svg>
                    )},
                    { name: 'Mail', icon: (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                        <polyline points="22,6 12,13 2,6"/>
                      </svg>
                    )}
                  ].map((social) => (
                    <div
                      key={social.name}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-[#3a3633] text-[#d0cfce] transition-colors duration-300 hover:bg-[#4a4644] cursor-pointer"
                      title={social.name}
                    >
                      {social.icon}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="border-t border-[#c55125] py-4 text-center text-xs text-[#4a4644] sm:py-6">
            Pawnly Platform
          </div>
        </footer>
      </div>
    </div>
  );
}
