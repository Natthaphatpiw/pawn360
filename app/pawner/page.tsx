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

export default function PawnerPage() {
  return (
    <div className={`${notoSansThai.className} bg-[var(--bg)] text-[var(--ink)]`}>
      <div className="relative overflow-hidden">
        <header className="mx-auto flex w-full max-w-[1216px] items-center justify-between px-6 py-6 lg:px-14">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Image
                src="/landing/pawnly_logo.png"
                alt="Pawnly"
                width={302}
                height={80}
                priority
                className="h-8 w-auto"
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
            <button className="rounded-full bg-[var(--muted-2)] px-4 py-1.5 text-white transition-all duration-300 hover:scale-105 hover:shadow-md">
              ผู้ขอสินเชื่อ
            </button>
            <span className="h-6 w-px bg-[var(--line)]" />
            <button className="px-3 py-1 text-[var(--muted-2)] transition-all duration-300 hover:text-[var(--accent)] hover:scale-105">นักลงทุน</button>
            <span className="h-6 w-px bg-[var(--line)]" />
            <button className="px-3 py-1 text-[var(--muted-2)] transition-all duration-300 hover:text-[var(--accent)] hover:scale-105">จุดรับฝาก</button>
            <span className="h-6 w-px bg-[var(--line)]" />
            <button className="px-3 py-1 text-[var(--muted-2)] transition-all duration-300 hover:text-[var(--accent)] hover:scale-105">เกี่ยวกับเรา</button>
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

        <section className="mx-auto grid w-full max-w-[1216px] items-start gap-16 px-6 pb-24 pt-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-14">
          <div className="fade-up lg:pt-6">
            <h1 className="max-w-[480px] text-3xl font-light leading-[1.45] text-[#686360] sm:text-4xl lg:text-[44px]">
              เปลี่ยนทรัพย์สินของคุณ
              <br />เป็นเงินทุน... ง่ายๆ
              <br />เพียงปลายนิ้ว
            </h1>
            <p className="mt-4 max-w-[520px] text-sm leading-6 text-[#9a9694] sm:text-base">
              ไม่ต้องเดินทางไปหน้าร้าน ไม่ต้องรอคิว ประเมินราคาด้วย AI
              <br />
              และรับเงินโอนผ่านระบบ P2P ที่ปลอดภัยที่สุดบน Line OA
            </p>
            <div className="mt-5 flex flex-wrap">
              <button className="rounded-full border border-[var(--accent)] px-6 py-1.5 text-xs text-[var(--accent)] transition-colors duration-300 hover:bg-[var(--accent)] hover:text-white">
                เริ่มเลย!
              </button>
            </div>
          </div>
          <div className="fade-up flex flex-col items-center gap-3" style={{ animationDelay: '0.2s' }}>
            <Image
              src="/landing/com1_pawner.png"
              alt="Pawner app preview"
              width={1068}
              height={1068}
              className="h-auto w-full max-w-[430px] rounded-[24px] shadow-[0_18px_32px_rgba(67,63,60,0.18)]"
              priority
            />
          </div>
        </section>

        <section className="mx-auto w-full max-w-[1216px] px-6 pb-20 pt-10 lg:px-14">
          <div className="flex justify-center">
            <div className="h-px w-full max-w-[360px] bg-[#686360]/50" />
          </div>
          <div className="mt-14 grid items-center gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
            <div className="fade-up text-center" style={{ animationDelay: '0.3s' }}>
              <h2 className="mt-2 text-2xl font-medium text-[#686360] sm:text-3xl lg:text-[32px]">
                Why <span className="text-[var(--accent)]">Pawnly</span> for You?
              </h2>
              <p className="mt-1 text-xs text-[#8e8a86]">ทำไมต้องพอว์นลี่</p>
            </div>

            <div className="fade-up w-full lg:ml-auto" style={{ animationDelay: '0.4s' }}>
              <div className="flex flex-col gap-2 w-full max-w-[520px] rounded-[20px] bg-[#d8d6d4] p-4">
                {[
                  { en: 'Digital Item Listing', th: 'ลงรายการทรัพย์สินดิจิทัล' },
                  { en: 'AI Appraisal Tool', th: 'เครื่องมือประเมินด้วย AI' },
                  { en: 'Loan Status Tracking', th: 'ติดตามสถานะสินเชื่อ' },
                  { en: 'Secure Messaging', th: 'แชทส่วนตัวปลอดภัย' },
                  { en: 'Digital Loan Agreements', th: 'ทำสัญญาดิจิทัล' },
                ].map((item) => (
                  <div key={item.en} className="flex flex-row items-center gap-3 rounded-[14px] bg-[#cfcac7] px-4 py-2.5">
                    <div className="flex-none">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="8" cy="8" r="8" fill="#686360"/>
                        <path d="M4.5 8L6.5 10L11.5 5" stroke="#D0CFCE" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <div className="text-xs text-[#686360]" style={{ fontFamily: 'Noto Sans Thai' }}>
                      {item.en}
                    </div>
                    <div className="ml-auto flex h-[20px] items-center justify-center rounded-full bg-[#efeeed] px-3">
                      <span className="text-[11px] text-[#686360]" style={{ fontFamily: 'Noto Sans Thai' }}>{item.th}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[#686360] py-16">
          <div className="mx-auto w-full max-w-[1216px] px-6 text-center text-[#f5f4f2] lg:px-14">
            <h3 className="text-xl font-medium sm:text-[32px]">Benefits</h3>
            <p className="mt-1 text-xs text-[#c8b8b0]">ผลประโยชน์ของผู้ขอสินเชื่อ</p>
            <div className="mt-6 flex justify-center">
              <div className="h-px w-full max-w-[980px] bg-[#8e8a86]/60" />
            </div>

            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
              {[
                { title: 'Expanded Access to Capital', desc: "You're not limited to a single pawn shop's funds; connect with a wider network of investors eager to provide loans for your valuables.\nคุณไม่ได้จำกัดอยู่เพียงเงินทุนของร้านที่ให้บริการแห่งเดียว แต่เชื่อมต่อกับเครือข่ายนักลงทุนที่กว้างขวางขึ้นที่ต้องการให้ สินเชื่อ สำหรับสิ่งของมีค่าของคุณ" },
                { title: 'Superior Loan Terms', desc: "Receive multiple loan offers from various investors, allowing you to choose the best terms, interest rates, or loan amounts for your needs.\nรับข้อเสนอสินเชื่อต่างๆ จากนักลงทุนหลายราย ซึ่งช่วยให้คุณเลือกเงื่อนไข อัตราดอกเบี้ยหรือจำนวนเงินกู้ที่ดีที่สุดสำหรับความต้องการของคุณได้" },
                { title: 'Direct & Streamlined Funding', desc: "Potentially experience faster approval and disbursement of funds once an investor selects your item, cutting down on intermediaries.\nมีโอกาสสัมผัสประสบการณ์การอนุมัติและการจ่ายเงินที่รวดเร็วยิ่งขึ้น เมื่อนักลงทุนเลือกสินค้าของคุณ ลดคนกลาง" },
                { title: 'Wider Acceptance', desc: "Items that might not fit a traditional pawn shop's usual inventory can find a willing investor through the broader marketplace.\nทรัพย์สินที่มีลักษณะพิเศษที่อาจไม่ตรงกับเงื่อนไขของร้านให้บริการสินเชื่อทั่วไป แต่ยังมีโอกาสได้รับพิจารณาจากนักลงทุนที่สนใจผ่านตลาดที่กว้างขึ้น" },
                { title: 'Increased Flexibility', desc: "A larger pool of lenders often translates to more adaptable loan structures tailored to individual circumstances.\nกลุ่มผู้ให้กู้ที่มากขึ้นมักจะทำให้โครงสร้างสินเชื่อมีความยืดหยุ่นมากขึ้นซึ่งเหมาะสมกับสถานการณ์ แต่ละบุคคล" },
              ].map((item) => (
                <div key={item.title} className="flex flex-col items-center text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#f5f4f2] text-[#686360]">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {item.title.includes('Capital') && <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />}
                      {item.title.includes('Terms') && <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8" />}
                      {item.title.includes('Direct') && <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3" />}
                      {item.title.includes('Wider') && <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z M3.27 6.96L12 12.01l8.73-5.05 M12 22.08V12" />}
                      {item.title.includes('Flexibility') && <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M16 3.13a4 4 0 0 1 0 7.75 M23 21v-2a4 4 0 0 0-3-3.85" />}
                      {!item.title.match(/Capital|Terms|Direct|Wider|Flexibility/) && <circle cx="12" cy="12" r="10" />}
                    </svg>
                  </div>
                  <h4 className="text-xs font-semibold text-[#f5f4f2]">{item.title}</h4>
                  <p className="mt-2 text-[10px] leading-relaxed text-[#e7e5e4] whitespace-pre-line">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[1216px] px-6 py-20 lg:px-14">
          <div className="mb-10 text-center">
            <h3 className="text-xl font-medium text-[#686360] sm:text-[32px]">How it Works</h3>
            <p className="mt-1 text-xs text-[#9a9694]">4 ขั้นตอนง่ายๆ</p>
          </div>

          <div className="grid gap-6 md:grid-cols-4">
            {[
              { step: '1', title: 'Add Line', desc: 'แอดไลน์ของผู้ขอสินเชื่อ\nและลงทะเบียนง่ายๆ ใน 1 นาที' },
              { step: '2', title: 'Upload & Appraise', desc: 'ถ่ายรูปทรัพย์สินเพื่อรับการประเมินราคาเบื้องต้นด้วย AI' },
              { step: '3', title: 'Offer & Match', desc: 'รับข้อเสนอสินเชื่อจากนักลงทุนที่ถูกใจที่สุด' },
              { step: '4', title: 'Drop & Fund', desc: 'นำทรัพย์สินไปฝากที่ Drop Point หรือเลือกบริการรับของ\nเพื่อรับเงินโอนเข้าบัญชีทันที' },
            ].map((item) => (
              <div key={item.step} className="rounded-[20px] bg-[#c8c5c2] px-5 py-8 text-center">
                <div className="text-[48px] font-semibold leading-none text-[#f5f4f2]">{item.step}</div>
                <h4 className="mt-3 text-sm font-semibold text-[#f5f4f2]">{item.title}</h4>
                <p className="mt-2 text-[11px] leading-5 text-[#f5f4f2]/80 whitespace-pre-line">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="bg-[#2c2a28] text-[#686360]">
          <div className="mx-auto flex w-full max-w-[1216px] flex-wrap justify-between gap-10 px-6 py-16 lg:px-14">
            <div className="min-w-[220px]">
              <Image
                src="/landing/pawnly_foot.png"
                alt="Pawnly"
                width={600}
                height={96}
                className="h-7 w-auto"
              />
            </div>
            <div className="grid flex-1 grid-cols-2 gap-8 text-xs sm:grid-cols-4">
              <div>
                <h5 className={`${montserrat.className} text-sm font-semibold text-[#d0cfce]`}>Approaches</h5>
                <ul className="mt-3 space-y-2">
                  <li>
                    <Link href="/" className="hover:text-[#f5f4f2] transition-colors">หน้าหลัก</Link>
                  </li>
                  <li>
                    <span className="text-[#f5f4f2]">ผู้ขอสินเชื่อ</span>
                  </li>
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
          <div className="border-t border-[#c55125] py-6 text-center text-xs text-[#4a4644]">
            Pawnly Platform
          </div>
        </footer>
      </div>
    </div>
  );
}
