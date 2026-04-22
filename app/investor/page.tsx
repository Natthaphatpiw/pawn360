import Image from 'next/image';
import Link from 'next/link';
import { Noto_Sans_Thai, Bellota_Text } from 'next/font/google';
import com1Investor from '../../landind/com1_investor.png';
import com2Investor from '../../landind/com2_investor.png';
import com3Investor from '../../landind/com3_investor.png';
import com4Investor from '../../landind/com4_investor.png';

const notoSansThai = Noto_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['200', '300', '400', '500', '600', '700'],
});

const bellotaText = Bellota_Text({
  subsets: ['latin'],
  weight: ['300', '400', '700'],
});

const investmentLevels = [
  { title: 'Silver', image: com2Investor, alt: 'Silver investment tier' },
  { title: 'Gold', image: com3Investor, alt: 'Gold investment tier' },
  { title: 'Platinum', image: com4Investor, alt: 'Platinum investment tier' },
];

const lineUrl = 'https://lin.ee/Y7kgDFM';

export default function InvestorPage() {
  return (
    <div className={`${notoSansThai.className} bg-background text-foreground`}>
      <div className={`${bellotaText.className} opacity-0 absolute -z-10`}>.</div>
      <div className="relative overflow-hidden">
        <header className="mx-auto flex w-full max-w-[1216px] items-center justify-between px-4 py-4 sm:px-6 sm:py-6 lg:px-14">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Image
                src="/landing/pawnly_logo.png"
                alt="Pawnly"
                width={302}
                height={80}
                priority
                className="h-10 w-auto"
              />
            </Link>
          </div>

          <nav className="hidden items-center gap-2 text-sm lg:flex font-medium">
            <Link href="/">
              <button className="px-3 py-1 text-s1 transition-all duration-200 hover:text-primary cursor-pointer">
                หน้าหลัก
              </button>
            </Link>
            <span className="h-6 w-px bg-primary" />
            <Link href="/pawner">
              <button className="px-3 py-1 text-s1 transition-all duration-200 hover:text-primary cursor-pointer">
                ผู้ขอสินเชื่อ
              </button>
            </Link>
            <span className="h-6 w-px bg-primary" />
            <button className="rounded-[8px] bg-s1 px-4 py-1.5 text-primary-fg transition-all duration-200 hover:bg-s1-hover cursor-pointer">
              นักลงทุน
            </button>
            <span className="h-6 w-px bg-primary" />
            <Link href="/drop-point-page">
              <button className="px-3 py-1 text-s1 transition-all duration-200 hover:text-primary cursor-pointer">
                จุดรับฝาก
              </button>
            </Link>
            <span className="h-6 w-px bg-primary" />
            <Link href="/about">
              <button className="px-3 py-1 text-s1 transition-all duration-200 hover:text-primary cursor-pointer">
                เกี่ยวกับเรา
              </button>
            </Link>
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            <a
              href="#contact-us"
              className="rounded-full bg-s1 px-5 py-2 text-sm font-base text-primary-fg transition-colors hover:bg-s1-hover cursor-pointer"
            >
              <span className="font-english">Talk to us</span>
            </a>
          </div>

          <div className="relative lg:hidden">
            <input id="mobile-menu-investor" type="checkbox" className="peer sr-only" />
            <label
              htmlFor="mobile-menu-investor"
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-s1 transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 active:text-primary"
              aria-label="เปิดเมนู"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </label>

            <div className="fixed inset-0 z-50 flex items-stretch justify-end translate-x-full transition-all duration-500 ease-out peer-checked:opacity-100 peer-checked:translate-x-0 peer-checked:pointer-events-auto pointer-events-none">
              <div className="flex h-full w-full max-w-[100vw] flex-col bg-background-dark p-6 shadow-strong lg:w-[min(92vw,360px)] lg:max-w-[min(92vw,360px)] lg:rounded-[28px] lg:min-h-0">
                <div className="flex items-center justify-between">
                  <p className="text-xl font-base text-s1-fg">เมนู</p>
                  <label
                    htmlFor="mobile-menu-investor"
                    className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-primary-fg transition duration-200 active:text-primary active:scale-95"
                    aria-label="ปิดเมนู"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </label>
                </div>
                <div className="mt-8 flex-1 overflow-y-auto">
                  <div className="space-y-2 text-s1-fg">
                    <Link
                      href="/"
                      className="block rounded-2xl px-4 py-3 text-md text-primary-fg transition duration-200 hover:bg-primary-soft hover:text-primary active:bg-primary-active active:text-primary-fg active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    >
                      หน้าหลัก
                    </Link>
                    <Link
                      href="/pawner"
                      className="block rounded-2xl px-4 py-3 text-md text-primary-fg transition duration-200 hover:bg-primary-soft hover:text-primary active:bg-primary-active active:text-primary-fg active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    >
                      ผู้ขอสินเชื่อ
                    </Link>
                    <div className="rounded-2xl bg-primary px-4 py-3 text-md text-primary-fg">
                      นักลงทุน
                    </div>
                    <Link
                      href="/drop-point-page"
                      className="block rounded-2xl px-4 py-3 text-md text-primary-fg transition duration-200 hover:bg-primary-soft hover:text-primary active:bg-primary-active active:text-primary-fg active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    >
                      จุดรับฝาก
                    </Link>
                    <Link
                      href="/about"
                      className="block rounded-2xl px-4 py-3 text-md text-primary-fg transition duration-200 hover:bg-primary-soft hover:text-primary active:bg-primary-active active:text-primary-fg active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    >
                      เกี่ยวกับเรา
                    </Link>
                  </div>
                </div>
                <div className="mt-5">
                  <a
                    href="#contact-us"
                    className="block w-full rounded-full px-4 py-2 mb-10 border border-primary text-center text-lg text-primary transition duration-200 hover:bg-primary-hover active:bg-primary-active active:text-primary-fg active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 cursor-pointer"
                  >
                    <span className="font-english">Talk to us</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </header>

        <section className="mx-auto grid w-full max-w-[1216px] items-center gap-12 px-4 pb-24 pt-16 sm:px-6 sm:pb-28 lg:grid-cols-[1.1fr_0.9fr] lg:px-14">
          <div className="fade-up reveal-left text-center lg:text-left">
            <p className="mb-3 text-xs tracking-[0.3em] text-primary-border">Investor Hub</p>
            <h1 className="text-3xl font-extralight leading-[1.5] text-foreground sm:text-4xl lg:text-[50px]">
              ลงทุนอย่างมั่นใจ...
              <br />มีทรัพย์สินค้ำประกันทุกรายการ
            </h1>
            <p className="mt-5 max-w-[620px] text-base font-light text-foreground-subtle sm:text-lg mx-auto sm:mx-0">
              สร้างพอร์ตการลงทุนที่มั่นคง (Passive Income)
              <br className="hidden sm:block" />
              ผ่านการปล่อยเงินกู้ที่คัดสรรคุณภาพสูง พร้อมอัปเดตสถานะด้วย AI
            </p>
            <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center lg:justify-start">
              <a
                href={lineUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-primary bg-transparent px-6 py-2 text-sm text-primary transition-all duration-200 hover:bg-primary hover:text-primary-fg sm:w-auto cursor-pointer"
              >
                เริ่มเลย!
              </a>
            </div>
          </div>
          <div className="fade-up reveal-right flex justify-center lg:justify-end" style={{ transitionDelay: '0.2s' }}>
            <Image
              src={com1Investor}
              alt="Investor app preview"
              className="h-auto w-full max-w-[360px] sm:max-w-[420px] lg:max-w-[460px]"
              priority
            />
          </div>
        </section>

        <div className="mx-auto flex justify-center px-4 sm:px-6 mt-6 mb-12">
          <div className="h-px w-full max-w-[320px] bg-primary" />
        </div>

        {/* Why Pawnly */}
        <section className="mx-auto w-full max-w-[1216px] px-4 pb-16 pt-8 sm:px-6 sm:pb-20 sm:pt-10 lg:px-14">
          <div className="grid gap-8 md:grid-cols-[0.95fr_1.05fr] lg:gap-12">
            <div className="fade-up text-center lg:text-left" style={{ transitionDelay: '0.3s' }}>
              <p className="text-xs uppercase tracking-[0.3em] text-primary-border">Why Pawnly</p>
              <h2 className="mt-3 text-3xl font-medium text-s1 sm:text-4xl lg:text-[40px] font-english">
                Why <span className="text-primary font-bold">Pawnly</span> for You?
              </h2>
              <p className="mt-4 max-w-[560px] text-sm leading-7 text-foreground-subtle font-light">
                บริการของเราถูกออกแบบเพื่อให้ผู้ขอสินเชื่อเข้าถึงเงินทุนได้อย่างรวดเร็ว ปลอดภัย และสะดวกสบายจากทุกที่
              </p>
            </div>
            <div className="fade-up" style={{ transitionDelay: '0.4s' }}>
              <div className="flex flex-wrap gap-6 justify-center">
                {[
                  { en: 'List of pawners', th: 'รายชื่อผู้ขอสินเชื่อทั้งหมด' },
                  { en: 'Evaluation system', th: 'ระบบประเมินราคา' },
                  { en: 'Asset storage', th: 'การจัดเก็บทรัพย์' },
                  { en: 'Status tracking', th: 'การติดตามสถานะ' },
                  { en: 'Contract management', th: 'จัดการสัญญา' },
                ].map((item) => (
                  <div
                    key={item.en}
                    className="rounded-[24px] border border-primary-border bg-background-white/90 p-5 text-left min-w-[240px] flex-1"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-soft text-primary">
                        <svg width="24" height="24" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <circle cx="8" cy="8" r="8" fill="currentColor" />
                          <path d="M4.5 8L6.5 10L11.5 5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-s1">{item.en}</h4>
                        <p className="mt-1 text-xs leading-5 text-foreground-subtle font-light" style={{ fontFamily: 'Noto Sans Thai' }}>
                          {item.th}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Benefits */}
        <section className="relative overflow-hidden bg-background-dark my-12 py-12 sm:py-16">
          <div className="mx-auto w-full max-w-[1216px] px-4 text-center sm:px-6 lg:px-14">
            <div className="mx-auto max-w-[720px]">
              <h3 className="text-3xl font-medium text-primary-fg sm:text-[40px] font-english">Benefits</h3>
              <p className="mt-2 text-sm text-foreground-subtle sm:text-base">ผลประโยชน์ของนักลงทุน</p>
            </div>
            <div className="mt-6 flex justify-center sm:mt-8">
              <div className="h-px w-full bg-primary/30" />
            </div>

            <div className="mt-8 flex flex-wrap gap-6 justify-center">
              {[
                { title: 'Asset-Backed Security', desc: "Your investments are secured by tangible, verifiable assets physically held.\nการลงทุนของคุณได้รับการคุ้มครอง โดยสินทรัพย์ที่จับต้องได้และตรวจ สอบได้ซึ่งได้รับการถือครอง" },
                { title: 'More Competitive Offers', desc: "Add a new layer of stability and opportunity to your investments with secured, short-term loans.\nค้นพบทางเลือกการลงทุนอันเป็น เอกลักษณ์ที่ให้ดอกเบี้ยที่น่าดึงดูดและ ผลตอบแทนคงที่" },
                { title: 'Diversify Your Portfolio', desc: "Add a new layer of stability and opportunity to your investments with secured, short-term loans.\nเรียกดูรายการที่ผู้ขอสินเชื่อเสนอ ดูการประเมินราคาโดยละเอียด และมีส่วนร่วมโดยตรงในการระดมทุนสินเชื่อที่ตรงตามเกณฑ์ของคุณ" },
                { title: 'Direct & Transparent Access', desc: "Browse items posted by pawners, view detailed appraisals, and engage directly to fund loans that meet your criteria.\nเรียกดูรายการที่ผู้ขอสินเชื่อเสนอ ดูการประเมินราคาโดยละเอียด และมีส่วนร่วมโดยตรงในการระดมทุนสินเชื่อที่ตรงตามเกณฑ์ของคุณ" },
                { title: 'Manage Your Portfolio', desc: "Utilize an intuitive dashboard to track your investments, disburse funds, and monitor your returns with ease.\nใช้แดชบอร์ดที่ใช้งานง่ายเพื่อติดตามการลงทุนของคุณ จ่ายเงิน และตรวจสอบผลตอบแทนของคุณได้อย่างง่ายดาย" },
              ].map((item, index) => {
                const [english, thai] = item.desc.split('\n');
                return (
                  <div
                    key={item.title}
                    className="font-english fade-up rounded-[28px] bg-background-darker px-4 py-6 min-w-[240px] flex-1"
                    style={{ transitionDelay: `${index * 0.1}s` }}
                  >
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft text-primary">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M20.82 12.676a.98.98 0 0 0 0-1.96C14.764 10.58 12 7.776 12 1.896a.98.98 0 0 0-1.96 0c0 5.93-2.832 8.732-8.82 8.82a.98.98 0 0 0 0 1.96c5.939 0 8.732 2.803 8.82 8.82a.98.98 0 1 0 1.96 0c.304-6.046 3.087-8.82 8.761-8.82Zm-3.9-8.702h1.225v1.225a.735.735 0 0 0 1.47 0V3.974h1.225a.735.735 0 0 0 0-1.47h-1.225V1.279a.735.735 0 0 0-1.47 0v1.225H16.92a.735.735 0 0 0 0 1.47m6.105 16.052H21.8v-1.225a.735.735 0 0 0-1.47 0v1.225h-1.225a.735.735 0 0 0 0 1.47h1.225v1.225a.735.735 0 0 0 1.47 0v-1.225h1.225a.735.735 0 0 0 0-1.47"/>
                      </svg>
                    </div>
                    <h4 className="text-md font-semibold text-primary">{item.title}</h4>
                    <p className="mt-2 text-sm text-foreground-subtle font-english font-base">{english}</p>
                    {thai && <p className="mt-1 text-sm text-foreground-subtle font-light">{thai}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Investment Levels */}
        <section className="mx-auto w-full max-w-[1216px] px-4 py-16 sm:px-6 sm:py-20 lg:px-14">
          <div className="mb-10 text-center">
            <h3 className="text-3xl font-medium text-s1 sm:text-[40px] font-english">Investment levels</h3>
            <p className="mt-2 text-sm text-foreground-subtle sm:text-base">ระดับการลงทุน</p>
          </div>

          <div className="fade-up mt-10 grid gap-0 justify-items-center sm:gap-1 sm:grid-cols-3 lg:grid-cols-3">
            {investmentLevels.map((tier) => (
              <div key={tier.title} className="flex flex-col items-center gap-3">
                <Image
                  src={tier.image}
                  alt={tier.alt}
                  className="h-auto w-full max-w-[560px] sm:max-w-[480px] lg:max-w-[560px]"
                />
              </div>
            ))}
          </div>
        </section>

        <div className="mx-auto flex justify-center px-4 sm:px-6">
          <div className="h-px w-full max-w-[320px] bg-[var(--accent)]" />
        </div>

        <div className="mx-auto flex justify-center px-4 sm:px-6 mt-6 mb-12">
          <div className="h-px w-full max-w-[320px] bg-primary" />
        </div>

        {/* Investor Journey */}
        <section className="mx-auto w-full max-w-[1216px] px-4 py-16 sm:px-6 sm:py-20 lg:px-14">
          <div className="mb-10 text-center">
            <h3 className="text-3xl font-medium text-s1 sm:text-[40px] font-english">Investor Journey</h3>
            <p className="mt-2 text-sm text-foreground-subtle sm:text-base">ขั้นตอนของนักลงทุน</p>
          </div>

          <div className="fade-up grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { step: '1', title: 'Browse', desc: 'แอดไลน์ และ เลือกดูรายการทรัพย์สินที่มีผู้ต้องการขอสินเชื่อ', href: lineUrl },
              { step: '2', title: 'Fund', desc: 'เลือกรายการที่สนใจและทำการโอนเงินผ่านระบบตัวกลางที่ปลอดภัย' },
              { step: '3', title: 'Earn', desc: 'รับผลตอบแทนตามระยะเวลาที่กำหนดในสัญญา' },
              { step: '4', title: 'Settle', desc: 'เลือกรับเงินคืน หรือรับทรัพย์สินเมื่อสิ้นสุดสัญญา' },
            ].map((item) => {
              const cardClasses =
                'rounded-[24px] border border-primary-border/40 bg-background-white/20 p-6 text-center transition-transform duration-300 hover:-translate-y-1';

              const content = (
                <>
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-fg text-2xl font-semibold font-english">
                    {item.step}
                  </div>
                  <h4 className="mt-5 text-base font-semibold text-s1">{item.title}</h4>
                  <p className="mt-3 text-sm leading-6 text-foreground-subtle whitespace-pre-line font-light">
                    {item.desc}
                  </p>
                </>
              );

              if (item.href) {
                return (
                  <Link
                    key={item.step}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cardClasses}
                  >
                    {content}
                  </Link>
                );
              }

              return (
                <div key={item.step} className={cardClasses}>
                  {content}
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Contact ── */}
        <section id="contact-us" className="mx-auto w-full max-w-[1216px] px-4 pb-24 pt-16 sm:px-6 sm:pb-28 sm:pt-20 lg:px-14">
          <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-stretch">
            <div className="fade-up overflow-hidden rounded-[24px]">
              <Image
                src="/landing/com4.png"
                alt="Contact Pawnly"
                width={1200}
                height={936}
                className="h-full w-full object-fill mx-auto h-auto w-full max-w-[420px] object-cover lg:max-w-none"
              />
            </div>
            <div className="fade-up rounded-[24px] bg-background-white px-8 py-10 text-s1 sm:px-14 sm:py-14">
              <h3 className="text-[32px] font-medium leading-tight font-english">Wanna talk?</h3>
              <p className="mt-2 text-lg">คุยกับเรา</p>
              <p className="mt-8 max-w-[860px] text-[14px] leading-relaxed font-english">
                Speak with our experts. Schedule a consultation at a time that works best for you.
                Book your session below.
              </p>
              <p className="mt-2 max-w-[860px] text-sm leading-relaxed font-light">
                ปรึกษาผู้เชี่ยวชาญของเราโดยตรง นัดหมายวันและเวลาที่คุณสะดวกเพื่อพูดคุยรายละเอียด
                จองเวลาได้ที่นี่
              </p>
              <div className="mt-10 flex justify-center sm:justify-center">
                <a
                  href="https://calendar.google.com/calendar"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-2 text-sm text-primary-fg transition-all duration-200 hover:scale-100 hover:bg-primary-hover cursor-pointer"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" className="mr-2 h-4 w-4">
                    <path d="M11 6.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5zm-3 0a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5zm-5 3a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5zm3 0a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5z" />
                    <path d="M3.5 0a.5.5 0 0 1 .5.5V1h8V.5a.5.5 0 0 1 1 0V1h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h1V.5a.5.5 0 0 1 .5-.5M1 4v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4z" />
                  </svg>
                  <span className="font-english">Book a date and time</span>
                </a>
              </div>
            </div>
          </div>
        </section>

        <footer className="border-t border-line-soft bg-background-darker text-s1">
          <div className="mx-auto w-full max-w-[1216px] px-4 py-10 sm:px-6 sm:py-14 lg:px-14">
            <div className="grid gap-10 text-center items-center justify-items-center lg:grid-cols-[minmax(180px,260px)_1fr] lg:items-start lg:justify-items-stretch">
              <div className="flex w-full items-center justify-center lg:items-start lg:justify-start">
                <Image
                  src="/landing/pawnly_foot.png"
                  alt="Pawnly"
                  width={600}
                  height={96}
                  className="h-6 w-auto sm:h-7"
                />
              </div>

              <div className="grid gap-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 text-xs text-center lg:text-left w-full justify-items-center lg:justify-items-start">
                <div className="w-full">
                  <h5 className="text-sm font-semibold text-primary font-english">Approaches</h5>
                  <ul className="mt-3 space-y-2">
                    <li><Link href="/" className="text-foreground-subtle transition-colors hover:text-primary">หน้าหลัก</Link></li>
                    <li><Link href="/pawner" className="text-foreground-subtle transition-colors hover:text-primary">ผู้ขอสินเชื่อ</Link></li>
                    <li><Link href="/investor" className="text-foreground-subtle transition-colors hover:text-primary">นักลงทุน</Link></li>
                    <li><Link href="/drop-point-page" className="text-foreground-subtle transition-colors hover:text-primary">จุดรับฝาก</Link></li>
                  </ul>
                </div>
                <div className="w-full">
                  <h5 className="text-sm font-semibold text-primary font-english">Company</h5>
                  <ul className="mt-3 space-y-2">
                    <li><Link href="/about" className="text-foreground-subtle transition-colors hover:text-primary">เกี่ยวกับเรา</Link></li>
                    <li><Link href="https://calendar.google.com/calendar" target="_blank" rel="noopener noreferrer" className="text-foreground-subtle transition-colors hover:text-primary">ติดต่อเรา</Link></li>
                  </ul>
                </div>
                <div className="w-full sm:col-span-2 lg:col-span-1 flex flex-col items-center lg:items-start">
                  <h5 className="text-sm font-semibold text-primary font-english">Follow us</h5>
                  <div className="mt-3 flex flex-wrap gap-2 justify-center lg:justify-start">
                    {[
                      { name: 'Facebook', href: 'https://www.facebook.com', icon: (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                        </svg>
                      )},
                      { name: 'YouTube', href: 'https://www.youtube.com', icon: (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                        </svg>
                      )},
                      { name: 'X', href: 'https://x.com', icon: (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                        </svg>
                      )},
                      { name: 'Mail', href: 'https://mail.google.com', icon: (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                          <polyline points="22,6 12,13 2,6"/>
                        </svg>
                      )},
                    ].map((social) => (
                      <a
                        key={social.name}
                        href={social.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-primary transition-colors duration-300 hover:bg-primary hover:text-primary-fg cursor-pointer"
                        title={social.name}
                      >
                        {social.icon}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="border-t border-line-soft py-6 text-center text-xs">
            <p className="text-xs tracking-[0.3em] text-primary-border/65 font-light">Pawnly Platform</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
