import Image from 'next/image';
import Link from 'next/link';
import { Noto_Sans_Thai } from 'next/font/google';
import sub1 from '../landind/sub1.png';
import sub2 from '../landind/sub2.png';
import sub3 from '../landind/sub3.png';

const notoSansThai = Noto_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['200', '300', '400', '500', '600', '700'],
});

export default function Home() {
  return (
    <div className={`${notoSansThai.className} bg-background text-foreground`}>
      <div className="relative overflow-hidden">

        {/* ── Header ── */}
        <header className="mx-auto flex w-full max-w-[1216px] items-center justify-between px-4 py-4 sm:px-6 sm:py-6 lg:px-14">
          <div className="flex items-center gap-4">
            <Image
              src="/landing/pawnly_logo.png"
              alt="Pawnly"
              width={302}
              height={80}
              priority
              className="h-10 w-auto"
            />
          </div>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-2 text-sm lg:flex font-medium">
            <Link href="/">
              <button className="rounded-[8px] bg-s1 px-4 py-1.5 text-white transition-all duration-200 hover:bg-s1-hover cursor-pointer">
                หน้าหลัก
              </button>
            </Link>
            <span className="h-6 w-px bg-line" />
            <Link href="/pawner">
              <button className="px-3 py-1 text-s1 transition-all duration-200 hover:text-primary cursor-pointer">ผู้ขอสินเชื่อ</button>
            </Link>
            <span className="h-6 w-px bg-line" />
            <Link href="/investor">
              <button className="px-3 py-1 text-s1 transition-all duration-200 hover:text-primary cursor-pointer">นักลงทุน</button>
            </Link>
            <span className="h-6 w-px bg-line" />
            <Link href="/drop-point-page">
              <button className="px-3 py-1 text-s1 transition-all duration-200 hover:text-primary cursor-pointer">จุดรับฝาก</button>
            </Link>
            <span className="h-6 w-px bg-line" />
            <Link href="/about">
              <button className="px-3 py-1 text-s1 transition-all duration-200 hover:text-primary cursor-pointer">เกี่ยวกับเรา</button>
            </Link>
          </nav>

          {/* Desktop CTA */}
          <div className="hidden items-center gap-3 lg:flex">
            <a
              href="#contact-us"
              className="rounded-full bg-s1 px-5 py-2 text-sm font-base text-white transition-colors hover:bg-s1-hover cursor-pointer"
            >
              Talk to us
            </a>
          </div>

          {/* Mobile hamburger */}
          <div className="relative lg:hidden">
            <input id="mobile-menu-home" type="checkbox" className="peer sr-only" />
            <label
              htmlFor="mobile-menu-home"
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-line text-s1 transition-colors duration-300 hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              aria-label="เปิดเมนู"
            >
              <span className="flex h-4 w-4 flex-col justify-between">
                <span className="block h-[2px] w-full rounded-full bg-s1" />
                <span className="block h-[2px] w-full rounded-full bg-s1" />
                <span className="block h-[2px] w-full rounded-full bg-s1" />
              </span>
            </label>
            {/* Backdrop */}
            <label
              htmlFor="mobile-menu-home"
              className="fixed inset-0 z-40 bg-black/40 opacity-0 backdrop-blur-sm transition-opacity duration-300 peer-checked:opacity-100 peer-checked:pointer-events-auto pointer-events-none"
              aria-hidden="true"
            />
            {/* Modal menu */}
            <div className="fixed inset-0 z-50 flex items-center justify-center opacity-0 transition-all duration-300 peer-checked:opacity-100 peer-checked:pointer-events-auto pointer-events-none">
              <div className="w-[min(92vw,360px)] rounded-[28px] bg-background p-6 shadow-[0_20px_50px_rgba(44,42,40,0.2)] translate-y-4 scale-95 transition-all duration-300">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-s1">เมนู</p>
                  <label
                    htmlFor="mobile-menu-home"
                    className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-line text-s1 transition-colors duration-200 hover:border-line-strong"
                    aria-label="ปิดเมนู"
                  >
                    <span className="text-lg leading-none">×</span>
                  </label>
                </div>
                <div className="mt-4 space-y-2 text-s1">
                  <div className="rounded-2xl bg-s1 px-4 py-3 text-sm text-white">หน้าหลัก</div>
                  <Link href="/pawner" className="block rounded-2xl px-4 py-3 text-sm transition-colors duration-200 hover:bg-s1-soft">ผู้ขอสินเชื่อ</Link>
                  <Link href="/investor" className="block rounded-2xl px-4 py-3 text-sm transition-colors duration-200 hover:bg-s1-soft">นักลงทุน</Link>
                  <Link href="/drop-point-page" className="block rounded-2xl px-4 py-3 text-sm transition-colors duration-200 hover:bg-s1-soft">จุดรับฝาก</Link>
                  <Link href="/about" className="block rounded-2xl px-4 py-3 text-sm transition-colors duration-200 hover:bg-s1-soft">เกี่ยวกับเรา</Link>
                </div>
                <div className="mt-5">
                  <a
                    href="#contact-us"
                    className="block w-full rounded-full bg-s1 px-4 py-2 text-center text-xs text-white transition-colors hover:bg-s1-hover cursor-pointer"
                  >
                    Talk to us
                  </a>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* ── Hero ── */}
        <section className="mx-auto grid w-full max-w-[1216px] items-center gap-12 px-4 pb-24 pt-16 sm:px-6 sm:pb-28 lg:grid-cols-[1.1fr_0.9fr] lg:px-14">
          <div className="fade-up reveal-left text-center sm:text-left">
            <p className="mb-3 text-xs tracking-[0.3em] text-primary-border">
              Pawnly Platform
            </p>
            <h1 className="text-3xl font-extralight leading-[1.5] text-black sm:text-4xl lg:text-[50px]">
              ปลดล็อกมูลค่าทรัพย์สิน
              <br />ของคุณ ด้วยเทคโนโลยี <span className="text-primary font-medium font-">AI</span>
              <br />และการเชื่อมต่อที่เหนือกว่า
            </h1>
            <p className="mt-5 max-w-[620px] text-base text-foreground-subtle sm:text-lg mx-auto sm:mx-0">
              แพลตฟอร์มสินเชื่อมีหลักประกันแบบ P2P ที่ง่ายที่สุด ประเมินราคาแม่นยำด้วย AI
              และดำเนินการผ่าน Line OA 100% ไม่ต้องเสียเวลาเดินทางไปที่ร้าน
            </p>
            <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <Link href="/pawner">
                <button className="w-full rounded-full border border-primary bg-transparent px-6 py-2 text-sm text-primary transition-all duration-200 hover:bg-primary hover:text-primary-fg sm:w-auto cursor-pointer">
                  ต้องการเงินทุน (Start Borrowing)
                </button>
              </Link>
              <Link href="/investor">
                <button className="w-full rounded-full border border-primary bg-transparent px-6 py-2 text-sm text-primary transition-all duration-200 hover:bg-primary hover:text-primary-fg sm:w-auto cursor-pointer">
                  สนใจลงทุน (Start Investing)
                </button>
              </Link>
            </div>
          </div>
          <div className="fade-up reveal-right flex justify-center lg:justify-end" style={{ transitionDelay: '0.2s' }}>
            <Image
              src="/landing/com1.png"
              alt="Pawnly app previews"
              width={1068}
              height={1068}
              className="h-auto w-full max-w-[360px] drop-shadow-[0_24px_40px_rgba(67,63,60,0.2)] transition-all duration-500 sm:max-w-[420px] lg:max-w-[460px]"
              priority
            />
          </div>
        </section>

        {/* ── App Preview + What is Pawnly ── */}
        <section className="mx-auto w-full max-w-[1216px] px-4 pb-24 sm:px-6 sm:pb-28 lg:px-14">
          <div className="relative flex flex-col items-center">
            <div className="fade-up reveal-scale relative z-10 flex w-full justify-center" style={{ transitionDelay: '0.3s' }}>
              <Image
                src="/landing/com2.png"
                alt="Pawnly UI overview"
                width={534}
                height={434}
                className="h-auto w-full max-w-[534px] scale-[0.95]"
              />
            </div>
            <div className="fade-up relative z-0 mx-auto -mt-10 w-full max-w-[1216px] rounded-[40px] bg-grey-5 px-4 pb-10 pt-12 text-center text-s1 sm:-mt-16 sm:px-12 sm:pt-16 lg:-mt-20">
              <h2 className="text-2xl font-medium sm:text-3xl lg:text-[40px]">
                What is <span className="text-primary font-bold">Pawnly</span>?
              </h2>
              <p className="mt-1 text-xl text-foreground-subtle">พอว์นลี่คืออะไร</p>
              <p className="mt-4 leading-6 xs:text-sm">
                Pawnly is an innovative, fully digital P2P Secured Lending Platform that operates primarily through a
                Line Official Account (Line OA) interface. Its core function is to connect individuals seeking loans
                against their assets (Pawners) directly with private investors who fund those loans.
              </p>
              <p className="mt-4 leading-6 xs:text-sm">
                Pawnly คือ แพลตฟอร์มสินเชื่อมีหลักประกันแบบ P2P ที่ทำงานผ่าน Line Official Account (Line OA) เป็นหลัก
                โดยเน้นการสร้างความสะดวกสบายและความรวดเร็วแก่ ผู้ขอสินเชื่อ (Pawners) และการจัดหาสิ่งอำนวยความสะดวก
                สำหรับ นักลงทุน (Investors) เพื่อให้สามารถให้สินเชื่อโดยตรงได้ง่ายขึ้น
              </p>
              <Link href="/about" className="mt-6 inline-block">
                <button className="mt-6 inline-flex items-center justify-center rounded-full border border-primary bg-transparent px-6 py-2 text-sm text-primary transition-all duration-200 hover:scale-100 hover:bg-primary hover:text-primary-fg hover:shadow-primary/25 cursor-pointer">
                  อ่านเพิ่มเติม
                  <span className="ml-2 inline-flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="bi bi-arrow-right" viewBox="0 0 16 16">
                      <path fill-rule="evenodd" d="M1 8a.5.5 0 0 1 .5-.5h11.793l-3.147-3.146a.5.5 0 0 1 .708-.708l4 4a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708-.708L13.293 8.5H1.5A.5.5 0 0 1 1 8"/>
                    </svg>
                  </span>
                </button>
              </Link>
            </div>
          </div>
        </section>

        {/* ── Three Pillars ── */}
        <section className="mx-auto w-full max-w-[1216px] px-4 pb-24 text-center sm:px-6 sm:pb-28 lg:px-14">
          <div className="fade-up">
            <h3 className="text-xl font-medium text-s1 sm:text-[36px]">Our Three Pillars</h3>
            <p className="mt-1 text-lg text-foreground-subtle">Our services/Solutions</p>
          </div>
          <div className="fade-up mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3" style={{ transitionDelay: '0.2s' }}>
            {[
              { href: '/pawner', src: sub1, alt: 'Access to funding for pawners' },
              { href: '/investor', src: sub2, alt: 'Stable investment for investors' },
              { href: '/drop-point-page', src: sub3, alt: 'Business partnerships for drop points' },
            ].map((item) => (
              <Link key={item.href} href={item.href}>
                <Image
                  src={item.src}
                  alt={item.alt}
                  className="h-auto w-full rounded-[24px] shadow-[0_18px_40px_rgba(67,63,60,0.12)] hover:scale-105 hover:shadow-[0_25px_50px_rgba(67,63,60,0.2)] transition-all duration-300 cursor-pointer"
                />
              </Link>
            ))}
          </div>
        </section>

        {/* ── Why Pawnly ── */}
        <section className="bg-s1 py-16 sm:py-20">
          <div className="mx-auto w-full max-w-[1216px] px-4 text-center text-white sm:px-6 lg:px-14">
            <h3 className="text-xl font-medium sm:text-[36px] leading-[1]">Why Pawnly?</h3>
            <div className="mt-4 grid gap-6 sm:mt-6 sm:grid-cols-2 lg:mt-8 lg:grid-cols-3">
              {[
                {
                  title: 'Safety First',
                  desc: 'Your valuables are stored in our high-security vaults, monitored 24/7, and fully covered by premium insurance for your ultimate peace of mind.\n ทรัพย์สินของคุณจะถูกจัดเก็บในห้องมั่นคงที่มีระบบรักษาความปลอดภัย 24 ชั่วโมง พร้อมการคุ้มครองจากประกันภัยเต็มวงเงิน เพื่อความสบายใจสูงสุดของคุณ',
                  icon: (
                    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M0 32C0 14.3269 14.3269 0 32 0C49.6731 0 64 14.3269 64 32C64 49.6731 49.6731 64 32 64C14.3269 64 0 49.6731 0 32Z" fill="#F0EFEE"/>
                      <path d="M17 43.6667V20.3333C17 19.4493 17.3512 18.6014 17.9763 17.9763C18.6014 17.3512 19.4493 17 20.3333 17H43.6667C44.5507 17 45.3986 17.3512 46.0237 17.9763C46.6488 18.6014 47 19.4493 47 20.3333V43.6667C47 44.5507 46.6488 45.3986 46.0237 46.0237C45.3986 46.6488 44.5507 47 43.6667 47H20.3333C19.4493 47 18.6014 46.6488 17.9763 46.0237C17.3512 45.3986 17 44.5507 17 43.6667Z" stroke="#686360" strokeWidth="2.5"/>
                      <path d="M42.0007 35.3333V28.6667M32.834 27.8333L34.5007 26.1667M24.5007 27.8333L22.834 26.1667M22.834 37.8333L24.5007 36.1667M34.5007 37.8333L32.834 36.1667M15.334 25.3333H17.0007M15.334 22H17.0007M17.0007 38.6667H15.334M17.0007 42H15.334M28.6673 37C27.3412 37 26.0695 36.4732 25.1318 35.5355C24.1941 34.5979 23.6673 33.3261 23.6673 32C23.6673 30.6739 24.1941 29.4021 25.1318 28.4645C26.0695 27.5268 27.3412 27 28.6673 27C29.9934 27 31.2652 27.5268 32.2029 28.4645C33.1405 29.4021 33.6673 30.6739 33.6673 32C33.6673 33.3261 33.1405 34.5979 32.2029 35.5355C31.2652 36.4732 29.9934 37 28.6673 37Z" stroke="#686360" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ),
                },
                {
                  title: 'Expert Team',
                  desc: 'Every asset is meticulously verified by our experienced appraisal team, working in tandem with advanced AI technology to ensure fair and accurate market valuations.\n ทรัพย์สินทุกชิ้นผ่านการตรวจสอบอย่างละเอียดโดยทีมผู้เชี่ยวชาญเฉพาะทาง ร่วมกับเทคโนโลยี AI ที่ทันสมัย เพื่อให้มั่นใจในความแม่นยำและการประเมินมูลค่าที่เป็นธรรมตามราคาตลาด',
                  icon: (
                    <svg width="64" height="68" viewBox="0 0 64 68" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M0 34C0 16.3269 14.3269 2 32 2C49.6731 2 64 16.3269 64 34C64 51.6731 49.6731 66 32 66C14.3269 66 0 51.6731 0 34Z" fill="#F0EFEE"/>
                      <g transform="translate(12 14) scale(2)">
                        <path fill="#686360" d="M10 3a1.5 1.5 0 1 0 0 3a1.5 1.5 0 0 0 0-3M7.5 4.5a2.5 2.5 0 1 1 5 0a2.5 2.5 0 0 1-5 0m8-.5a1 1 0 1 0 0 2a1 1 0 0 0 0-2m-2 1a2 2 0 1 1 4 0a2 2 0 0 1-4 0m-10 0a1 1 0 1 1 2 0a1 1 0 0 1-2 0m1-2a2 2 0 1 0 0 4a2 2 0 0 0 0-4m.6 11.998L5 15a2 2 0 0 1-2-2V9.25A.25.25 0 0 1 3.25 9h1.764c.04-.367.17-.708.365-1H3.25C2.56 8 2 8.56 2 9.25V13a3 3 0 0 0 3.404 2.973a5 5 0 0 1-.304-.975m9.496.975Q14.794 16 15 16a3 3 0 0 0 3-3V9.25C18 8.56 17.44 8 16.75 8h-2.129c.196.292.325.633.365 1h1.764a.25.25 0 0 1 .25.25V13a2 2 0 0 1-2.1 1.998a5 5 0 0 1-.304.975M7.25 8C6.56 8 6 8.56 6 9.25V14a4 4 0 0 0 8 0V9.25C14 8.56 13.44 8 12.75 8zM7 9.25A.25.25 0 0 1 7.25 9h5.5a.25.25 0 0 1 .25.25V14a3 3 0 1 1-6 0z"/>
                      </g>
                    </svg>
                  ),
                },
                {
                  title: 'Absolute Transparency',
                  desc: 'All agreements are legally binding and fully transparent. You can monitor your asset status, loan details, and payment schedules in real-time through Line OA.\n ทุกสัญญาจัดทำอย่างถูกต้องตามกฎหมายและมีความโปร่งใสสูงสุด คุณสามารถติดตามสถานะทรัพย์สิน รายละเอียดสินเชื่อ และกำหนดการชำระเงินได้แบบเรียลไทม์ผ่าน Line OA',
                  icon: (
                    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M0 32C0 14.3269 14.3269 0 32 0C49.6731 0 64 14.3269 64 32C64 49.6731 49.6731 64 32 64C14.3269 64 0 49.6731 0 32Z" fill="#F0EFEE"/>
                      <path d="M17 19.75V32C17 44.25 32 49.5 32 49.5C32 49.5 47 44.25 47 32V19.75L32 14.5L17 19.75Z" stroke="#686360" strokeWidth="3.33333" strokeLinecap="square"/>
                      <path d="M25.6211 30.62L30.3328 35.3334L39.7611 25.905" stroke="#686360" strokeWidth="3.33333" strokeLinecap="square"/>
                    </svg>
                  ),
                },
              ].map((item, index) => (
                <div
                  key={item.title}
                  className={`fade-up rounded-2xl px-4 py-6 transition-all duration-200 hover:scale-[1.0] ${
                    index === 2 ? 'sm:col-span-2 lg:col-span-1' : ''
                  }`}
                  style={{ transitionDelay: '0.2s' }}
                >
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-s1-soft">
                    {item.icon}
                  </div>
                  <h4 className="text-sm font-semibold">{item.title}</h4>
                  <p className="mt-2 text-sm text-grey-6 whitespace-pre-line">{item.desc}</p>
                </div>
              ))}
            </div>
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
                className="h-full w-full object-cover"
              />
            </div>
            <div className="fade-up rounded-[24px] bg-white px-8 py-10 text-s1 sm:px-14 sm:py-14">
              <h3 className="text-[32px] font-medium leading-tight">Wanna talk?</h3>
              <p className="mt-2 text-lg">คุยกับเรา</p>
              <p className="mt-8 max-w-[860px] text-[14px] leading-relaxed">
                Speak with our experts. Schedule a consultation at a time that works best for you.
                Book your session below.
              </p>
              <p className="mt-2 max-w-[860px] text-sm leading-relaxed">
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
                  Book a date and time
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="bg-grey-1 text-s1">
          <div className="mx-auto w-full max-w-[1216px] px-4 py-10 sm:px-6 sm:py-14 lg:px-14">
            <div className="grid gap-10 text-center items-center justify-items-center lg:grid-cols-[minmax(180px,260px)_1fr] lg:items-start lg:justify-items-stretch">
              
              {/* Logo Section - อยู่ตรงกลางเสมอใน Mobile/Tablet และชิดซ้ายใน Desktop */}
              <div className="flex w-full items-center justify-center lg:items-start lg:justify-start">
                <Image
                  src="/landing/pawnly_foot.png"
                  alt="Pawnly"
                  width={600}
                  height={96}
                  className="h-6 w-auto sm:h-7" 
                  /* นำ mx-auto ออก เพราะเราใช้ Flexbox จากตัวแม่ (div) คุมแทนแล้วจะเสถียรกว่า */
                />
              </div>

              {/* Grid Links Section */}
              <div className="grid gap-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 text-xs text-center lg:text-left w-full justify-items-center lg:justify-items-start">
                
                {/* Approaches */}
                <div className="w-full">
                  <h5 className="text-sm font-semibold text-grey-5">Approaches</h5>
                  <ul className="mt-3 space-y-2">
                    <li><Link href="/home" className="hover:text-white transition-colors">หน้าหลัก</Link></li>
                    <li><Link href="/borrowers" className="hover:text-white transition-colors">ผู้ขอสินเชื่อ</Link></li>
                    <li><Link href="/investors" className="hover:text-white transition-colors">นักลงทุน</Link></li>
                    <li><Link href="/branches" className="hover:text-white transition-colors">จุดรับฝาก</Link></li>
                  </ul>
                </div>

                {/* Company */}
                <div className="w-full">
                  <h5 className="text-sm font-semibold text-grey-5">Company</h5>
                  <ul className="mt-3 space-y-2">
                    <li><Link href="/about" className="hover:text-white transition-colors">เกี่ยวกับเรา</Link></li>
                    <li><Link href="https://calendar.google.com/calendar" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">ติดต่อเรา</Link></li>
                  </ul>
                </div>

                {/* Follow us - ขยายเต็มใน Tablet (sm:col-span-2) */}
                <div className="w-full sm:col-span-2 lg:col-span-1 flex flex-col items-center lg:items-start">
                  <h5 className="text-sm font-semibold text-grey-5">Follow us</h5>
                  <div className="mt-3 flex flex-wrap gap-2 justify-center lg:justify-start">
                    {[
                      { name: 'Facebook', href: '...', icon: <svg>...</svg> },
                      { name: 'YouTube', href: '...', icon: <svg>...</svg> },
                      { name: 'X', href: '...', icon: <svg>...</svg> },
                      { name: 'Mail', href: '...', icon: <svg>...</svg> },
                    ].map((social) => (
                      <a
                        key={social.name}
                        href={social.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-grey-2 text-grey-6 transition-colors duration-300 hover:bg-s1-active cursor-pointer"
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
          
          <div className="border-t border-primary text-center text-xs text-s1-active py-6">
            <p className="text-xs tracking-[0.3em] text-grey-3">
              Pawnly Platform
            </p>
          </div>
        </footer>

      </div>
    </div>
  );
}
