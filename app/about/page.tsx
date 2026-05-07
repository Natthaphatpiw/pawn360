import Image from 'next/image';
import Link from 'next/link';
import { Noto_Sans_Thai, Bellota_Text } from 'next/font/google';
import com1About from '../../landind/com1_about.png';

const notoSansThai = Noto_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['200', '300', '400', '500', '600', '700'],
});

const bellotaText = Bellota_Text({
  subsets: ['latin'],
  weight: ['300', '400', '700'],
});

export default function AboutPage() {
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

          {/* Desktop nav */}
          <nav className="hidden items-center gap-2 text-sm lg:flex font-medium">
            <Link href="/">
              <button className="px-3 py-1 text-s1 transition-all duration-200 hover:text-primary cursor-pointer">
                หน้าหลัก
              </button>
            </Link>
            <span className="h-6 w-px bg-primary" />
            <Link href="/pawner">
              <button className="px-3 py-1 text-s1 transition-all duration-200 hover:text-primary cursor-pointer">ผู้ขอสินเชื่อ</button>
            </Link>
            <span className="h-6 w-px bg-primary" />
            <Link href="/investor">
              <button className="px-3 py-1 text-s1 transition-all duration-200 hover:text-primary cursor-pointer">นักลงทุน</button>
            </Link>
            <span className="h-6 w-px bg-primary" />
            <Link href="/drop-point-page">
              <button className="px-3 py-1 text-s1 transition-all duration-200 hover:text-primary cursor-pointer">จุดรับฝาก</button>
            </Link>
            <span className="h-6 w-px bg-primary" />
            <div className="rounded-[8px] bg-s1 px-4 py-1.5 text-primary-fg transition-all duration-200 cursor-pointer">
              เกี่ยวกับเรา
            </div>
          </nav>

          {/* Desktop CTA */}
          <div className="hidden items-center gap-3 lg:flex">
            <a
              href="#contact-us"
              className="rounded-full bg-s1 px-5 py-2 text-sm font-base text-primary-fg transition-colors hover:bg-s1-hover cursor-pointer"
            >
              <span className="font-english">Talk to us</span>
            </a>
          </div>

          {/* Mobile hamburger */}
          <div className="relative lg:hidden">
            <input id="mobile-menu-about" type="checkbox" className="peer sr-only" />
            <label
              htmlFor="mobile-menu-about"
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-s1 transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 active:text-primary"
              aria-label="เปิดเมนู"
            >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
            </label>

            {/* Modal menu */}
            <div className="fixed inset-0 z-50 flex items-stretch justify-end translate-x-full transition-all duration-500 ease-out peer-checked:opacity-100 peer-checked:translate-x-0 peer-checked:pointer-events-auto pointer-events-none">
              <div className="flex h-full w-full max-w-[100vw] flex-col bg-background-dark p-6 shadow-strong lg:w-[min(92vw,360px)] lg:max-w-[min(92vw,360px)] lg:rounded-[28px] lg:min-h-0">
                <div className="flex items-center justify-between">
                  <p className="text-xl font-base text-s1-fg">เมนู</p>
                  <label
                    htmlFor="mobile-menu-about"
                    className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-primary-fg transition duration-200 active:text-primary active:scale-95"
                    aria-label="ปิดเมนู"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>

                  </label>
                </div>
                <div className="mt-8 flex-1 overflow-y-auto">
                  <div className="space-y-2 text-s1">
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
                    <Link
                      href="/investor"
                      className="block rounded-2xl px-4 py-3 text-md text-primary-fg transition duration-200 hover:bg-primary-soft hover:text-primary active:bg-primary-active active:text-primary-fg active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    >
                      นักลงทุน
                    </Link>
                    <Link
                      href="/drop-point-page"
                      className="block rounded-2xl px-4 py-3 text-md text-primary-fg transition duration-200 hover:bg-primary-soft hover:text-primary active:bg-primary-active active:text-primary-fg active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    >
                      จุดรับฝาก
                    </Link>
                    <div className="rounded-2xl bg-primary px-4 py-3 text-md text-primary-fg">
                      เกี่ยวกับเรา
                    </div>
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

        <section className="mx-auto grid w-full max-w-[1216px] items-start gap-10 px-4 pb-16 pt-6 sm:gap-12 sm:px-6 sm:pb-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:px-14 lg:pb-24">
          <div className="fade-up reveal-left text-center sm:text-center lg:text-left lg:self-center lg:pt-8 lg:pb-10">
            <p className={`${bellotaText.className} text-xl font-light text-s1 sm:text-3xl lg:text-[60px]`}>About</p>
            <h1 className="mt-2 text-[44px] font-semibold leading-[1.05] text-primary sm:text-[70px] lg:text-[125px]">
              Pawnly
            </h1>
          </div>
          <div className="fade-up reveal-right flex flex-col items-center gap-2 sm:items-center lg:items-end sm:gap-3" style={{ transitionDelay: '0.2s' }}>
            <Image
              src={com1About}
              alt="About Pawnly"
              className="h-auto w-full max-w-[360px] sm:max-w-[420px] lg:max-w-[460px]"
              priority
            />
          </div>
        </section>

        <section className="mx-auto w-full max-w-[1216px] px-4 pb-16 pt-4 sm:px-6 sm:pb-20 lg:px-14">
          <div className="flex justify-center">
            <div className="h-px w-full max-w-[320px] bg-primary" />
          </div>
          <div className="mt-12 grid items-center gap-10 sm:gap-12 md:grid-cols-[0.9fr_1.1fr] lg:gap-16">
            <div className="self-center justify-self-center fade-up text-center sm:text-left" style={{ transitionDelay: '0.25s' }}>
              <h2 className="text-2xl font-medium text-s1 sm:text-3xl lg:text-[32px] font-english">
                Our <span className="text-primary font-bold">Identity</span>
              </h2>
              <p className="mt-1 text-xs leading-6 text-s1 sm:text-[16px]">ตัวตนของเรา</p>
            </div>

            <div className="fade-up text-center text-s1 sm:text-left" style={{ transitionDelay: '0.35s' }}>
              <h3 className="text-sm font-semibold text-s1 sm:text-base font-english">
                Revolutionizing Asset-Backed Lending
              </h3>
              <p className="mt-2 text-sm leading-6 text-s1 font-english">
              Pawnly is a forward-thinking Fintech startup based in Bangkok, Thailand. We were founded with a singular mission: to modernize the traditional secured lending industry through cutting-edge AI technology and a transparent Peer-to-Peer (P2P) ecosystem. We bridge the gap between asset owners and smart investors, making liquidity accessible, safe, and entirely digital.
              </p>
              <h3 className="mt-8 text-sm font-base text-s1 sm:text-base">
                ปฏิวัติวงการสินเชื่อมีหลักประกัน
              </h3>
              <p className="mt-2 text-sm leading-6 text-s1 font-light">
              Pawnly คือสตาร์ทอัพด้านฟินเทค (Fintech) ที่ตั้งอยู่ในกรุงเทพฯ ประเทศไทย เราก่อตั้งขึ้นด้วยพันธกิจเดียวคือ การยกระดับอุตสาหกรรมสินเชื่อมีหลักประกันให้ทันสมัยด้วยเทคโนโลยี AI ที่ล้ำสมัย และระบบนิเวศแบบ Peer-to-Peer (P2P) ที่โปร่งใส เราทำหน้าที่เป็นสะพานเชื่อมระหว่างเจ้าของทรัพย์สินและนักลงทุนที่ชาญฉลาด เพื่อให้การเปลี่ยนทรัพย์สินเป็นทุนนั้นเข้าถึงง่าย ปลอดภัย และเป็นดิจิทัลอย่างเต็มรูปแบบ
              </p>
            </div>
          </div>
        </section>

        <div className="mx-auto flex justify-center px-4 sm:px-6">
          <div className="h-px w-full max-w-[320px] bg-primary" />
        </div>

        <section className="mx-auto w-full max-w-[1216px] px-4 py-16 sm:px-6 sm:py-20 lg:px-14">
          <div className="text-center">
            <h3 className="text-lg font-medium text-s1 sm:text-xl lg:text-[32px] font-english font-bold">Our Vision & Mission</h3>
            <p className="mt-1 text-[16px] text-grey-4">วิสัยทัศน์และพันธกิจ</p>
          </div>
          <div className="mt-6 flex justify-center">
            <div className="h-px w-full max-w-[980px] bg-foreground-subtle" />
          </div>

          <div className="mt-10 grid gap-8 text-center sm:mt-12 sm:grid-cols-2 sm:text-left">
            <div className="fade-up flex flex-col items-center sm:items-start" style={{ transitionDelay: '0.2s' }}>
              <div className="self-center justify-self-center mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-s1 text-primary-fg">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" className="size-6">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
                </svg>
              </div>
              <h4 className="self-center justify-self-center text-lg text-s1 font-english font-bold">Vision</h4>
              <p className="text-center self-center justify-self-center mt-2 text-sm leading-5 text-s1 font-english font-light">
              To become Southeast Asia’s most trusted digital platform for secured asset matching.
                <br/>
                <br/>
                ก้าวสู่การเป็นแพลตฟอร์มดิจิทัลที่น่าเชื่อถือที่สุดในเอเชียตะวันออกเฉียงใต้ สำหรับการจับคู่สินเชื่อมีหลักประกัน
              </p>
            </div>

            <div className="fade-up flex flex-col items-center sm:items-start" style={{ transitionDelay: '0.3s' }}>
              <div className="self-center justify-self-center mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-s1 text-primary-fg">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="bi bi-flag" viewBox="0 0 16 16">
                  <path d="M14.778.085A.5.5 0 0 1 15 .5V8a.5.5 0 0 1-.314.464L14.5 8l.186.464-.003.001-.006.003-.023.009a12 12 0 0 1-.397.15c-.264.095-.631.223-1.047.35-.816.252-1.879.523-2.71.523-.847 0-1.548-.28-2.158-.525l-.028-.01C7.68 8.71 7.14 8.5 6.5 8.5c-.7 0-1.638.23-2.437.477A20 20 0 0 0 3 9.342V15.5a.5.5 0 0 1-1 0V.5a.5.5 0 0 1 1 0v.282c.226-.079.496-.17.79-.26C4.606.272 5.67 0 6.5 0c.84 0 1.524.277 2.121.519l.043.018C9.286.788 9.828 1 10.5 1c.7 0 1.638-.23 2.437-.477a20 20 0 0 0 1.349-.476l.019-.007.004-.002h.001M14 1.221c-.22.078-.48.167-.766.255-.81.252-1.872.523-2.734.523-.886 0-1.592-.286-2.203-.534l-.008-.003C7.662 1.21 7.139 1 6.5 1c-.669 0-1.606.229-2.415.478A21 21 0 0 0 3 1.845v6.433c.22-.078.48-.167.766-.255C4.576 7.77 5.638 7.5 6.5 7.5c.847 0 1.548.28 2.158.525l.028.01C9.32 8.29 9.86 8.5 10.5 8.5c.668 0 1.606-.229 2.415-.478A21 21 0 0 0 14 7.655V1.222z"/>
                </svg>
              </div>
              <h4 className="self-center justify-self-center text-sm font-semibold text-s1">Mission</h4>
              <p className="self-center justify-self-center text-center mt-2 text-sm leading-5 text-s1 font-english font-light">
              To empower individuals with instant liquidity and provide investors with secure, asset-backed opportunities through seamless Line OA integration and AI precision.
                <br/>
                <br/>
                มุ่งเน้นการเสริมสร้างศักยภาพให้บุคคลทั่วไปสามารถเข้าถึงเงินทุนได้ทันที และมอบโอกาสการลงทุนที่มีทรัพย์สินค้ำประกันที่ปลอดภัยให้แก่นักลงทุน ผ่านการใช้งานที่ง่ายบน Line OA และความแม่นยำของ AI
              </p>
            </div>
          </div>
        </section>

        <div className="mx-auto flex justify-center px-4 sm:px-6">
          <div className="h-px w-full max-w-[320px] bg-primary" />
        </div>

        <section className="mx-auto w-full max-w-[1216px] px-4 py-16 sm:px-6 sm:py-20 lg:px-14">
          <div className="fade-up mx-auto max-w-[980px] rounded-[32px] bg-grey-5 px-4 py-10 text-center text-s1 sm:px-12 sm:py-12">
            <h3 className="text-lg font-medium sm:text-xl lg:text-[28px] font-english font-bold">Our Commitment to Trust</h3>
            <p className="mt-1 text-lg text-s1/90 sm:text-[18px]">คำมั่นสัญญาแห่งความเชื่อมั่น</p>
            <p className="mt-4 text-sm font-light leading-6 text-s1 font-english">
            At Pawnly, trust is our currency. Every transaction is backed by Thai legal frameworks, every asset is secured in premium vaults, and every valuation is verified by AI trained on global market data. We are not just a platform; we are your local partner in financial growth.
            </p>
            <p className="mt-4 text-sm font-light leading-6 text-s1 font-english">
            ที่ Pawnly "ความไว้วางใจ" คือหัวใจสำคัญของเรา ทุกธุรกรรมได้รับการคุ้มครองภายใต้กรอบกฎหมายไทย ทรัพย์สินทุกชิ้นถูกจัดเก็บในห้องมั่นคงระดับพรีเมียม และทุกการประเมินราคาถูกยืนยันโดย AI ที่ฝึกฝนจากข้อมูลตลาดโลก เราไม่ได้เป็นเพียงแค่แพลตฟอร์ม แต่เราคือพันธมิตรท้องถิ่นที่จะช่วยให้คุณเติบโตทางการเงิน
            </p>
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

        {/* ── Footer ── */}
        <footer className="border-t border-line-soft bg-background-darker text-s1">
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
                  <h5 className="text-sm font-semibold text-primary font-english">Approaches</h5>
                  <ul className="mt-3 space-y-2">
                    <li><Link href="/" className="text-foreground-subtle transition-colors hover:text-primary">หน้าหลัก</Link></li>
                    <li><Link href="/pawner" className="text-foreground-subtle transition-colors hover:text-primary">ผู้ขอสินเชื่อ</Link></li>
                    <li><Link href="/investor" className="text-foreground-subtle transition-colors hover:text-primary">นักลงทุน</Link></li>
                    <li><Link href="/drop-point-page" className="text-foreground-subtle transition-colors hover:text-primary">จุดรับฝาก</Link></li>
                  </ul>
                </div>

                {/* Company */}
                <div className="w-full">
                  <h5 className="text-sm font-semibold text-primary font-english">Company</h5>
                  <ul className="mt-3 space-y-2">
                    <li><Link href="/about" className="text-foreground-subtle transition-colors hover:text-primary">เกี่ยวกับเรา</Link></li>
                    <li><Link href="https://calendar.google.com/calendar" target="_blank" rel="noopener noreferrer" className="text-foreground-subtle transition-colors hover:text-primary">ติดต่อเรา</Link></li>
                  </ul>
                </div>

                {/* Follow us - ขยายเต็มใน Tablet (sm:col-span-2) */}
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
            <p className="text-xs tracking-[0.3em] text-primary-border/65 font-light">
              Pawnly Platform
            </p>
          </div>
        </footer>

      </div>
    </div>
  );
}
