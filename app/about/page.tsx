import Image from 'next/image';
import Link from 'next/link';
import { Montserrat, Noto_Sans_Thai } from 'next/font/google';
import com1About from '../../landind/com1_about.png';

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const notoSansThai = Noto_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['200', '300', '400', '500', '600', '700'],
});

export default function AboutPage() {
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
            <button className="rounded-full bg-[var(--muted-2)] px-4 py-1.5 text-white transition-all duration-300 hover:scale-105 hover:shadow-md">
              เกี่ยวกับเรา
            </button>
          </nav>

          <div className={`${montserrat.className} hidden items-center gap-3 lg:flex`}>
            <button className="rounded-full border border-[#999999] px-4 py-1.5 text-xs text-[#686360]">
              Login
            </button>
            <button className="rounded-full bg-[#686360] px-4 py-1.5 text-xs text-[#f5f4f2]">
              Join us
            </button>
          </div>
          <div className="relative lg:hidden">
            <input id="mobile-menu-about" type="checkbox" className="peer sr-only" />
            <label
              htmlFor="mobile-menu-about"
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-[#cfcac7] text-[#686360] transition-colors duration-300 hover:border-[#bdb9b6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60"
              aria-label="เปิดเมนู"
            >
              <span className="flex h-4 w-4 flex-col justify-between">
                <span className="block h-[2px] w-full rounded-full bg-[#686360]" />
                <span className="block h-[2px] w-full rounded-full bg-[#686360]" />
                <span className="block h-[2px] w-full rounded-full bg-[#686360]" />
              </span>
            </label>
            <label
              htmlFor="mobile-menu-about"
              className="fixed inset-0 z-40 bg-black/40 opacity-0 backdrop-blur-sm transition-opacity duration-300 peer-checked:opacity-100 peer-checked:pointer-events-auto pointer-events-none"
              aria-hidden="true"
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center opacity-0 transition-all duration-300 peer-checked:opacity-100 peer-checked:pointer-events-auto pointer-events-none">
              <div className="w-[min(92vw,360px)] rounded-[28px] bg-[#f5f4f2] p-6 shadow-[0_20px_50px_rgba(44,42,40,0.2)] translate-y-4 scale-95 transition-all duration-300 peer-checked:translate-y-0 peer-checked:scale-100">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-[#686360]">เมนู</p>
                  <label
                    htmlFor="mobile-menu-about"
                    className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-[#e2e0dd] text-[#686360] transition-colors duration-200 hover:border-[#cfcac7]"
                    aria-label="ปิดเมนู"
                  >
                    <span className="text-lg leading-none">×</span>
                  </label>
                </div>
                <div className="mt-4 space-y-2 text-[#686360]">
                  <Link
                    href="/"
                    className="block rounded-2xl px-4 py-3 text-sm transition-colors duration-200 hover:bg-[#efeeed]"
                  >
                    หน้าหลัก
                  </Link>
                  <Link
                    href="/pawner"
                    className="block rounded-2xl px-4 py-3 text-sm transition-colors duration-200 hover:bg-[#efeeed]"
                  >
                    ผู้ขอสินเชื่อ
                  </Link>
                  <Link
                    href="/investor"
                    className="block rounded-2xl px-4 py-3 text-sm transition-colors duration-200 hover:bg-[#efeeed]"
                  >
                    นักลงทุน
                  </Link>
                  <Link
                    href="/drop-point-page"
                    className="block rounded-2xl px-4 py-3 text-sm transition-colors duration-200 hover:bg-[#efeeed]"
                  >
                    จุดรับฝาก
                  </Link>
                  <div className="rounded-2xl bg-[#686360] px-4 py-3 text-sm text-white">
                    เกี่ยวกับเรา
                  </div>
                </div>
                <div className="mt-5 grid gap-2">
                  <button className="w-full rounded-full border border-[#bdb9b6] px-4 py-2 text-xs text-[#686360]">
                    Login
                  </button>
                  <button className="w-full rounded-full bg-[#686360] px-4 py-2 text-xs text-[#f5f4f2]">
                    Join us
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>

        <section className="mx-auto grid w-full max-w-[1216px] items-start gap-10 px-4 pb-16 pt-6 sm:gap-12 sm:px-6 sm:pb-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:px-14 lg:pb-24">
          <div className="fade-up reveal-left text-center sm:text-left lg:self-center lg:pt-8 lg:pb-10">
            <p className="text-xl font-light text-[#686360] sm:text-3xl lg:text-[60px]">About</p>
            <h1 className="mt-2 text-[44px] font-semibold leading-[1.05] text-[var(--accent)] sm:text-[70px] lg:text-[125px]">
              Pawnly
            </h1>
          </div>
          <div className="fade-up reveal-right flex flex-col items-center gap-2 sm:items-end sm:gap-3" style={{ transitionDelay: '0.2s' }}>
            <Image
              src={com1About}
              alt="About Pawnly"
              className="h-auto w-full max-w-[320px] rounded-[24px] shadow-[0_18px_32px_rgba(67,63,60,0.18)] transition-transform duration-300 hover:scale-105 sm:max-w-[380px] lg:max-w-[430px]"
              priority
            />
          </div>
        </section>

        <section className="mx-auto w-full max-w-[1216px] px-4 pb-16 pt-4 sm:px-6 sm:pb-20 lg:px-14">
          <div className="flex justify-center">
            <div className="h-px w-full max-w-[320px] bg-[var(--accent)]" />
          </div>
          <div className="mt-12 grid items-center gap-10 sm:gap-12 md:grid-cols-[0.9fr_1.1fr] lg:gap-16">
            <div className="self-center justify-self-center fade-up text-center sm:text-left" style={{ transitionDelay: '0.25s' }}>
              <h2 className="text-2xl font-medium text-[#686360] sm:text-3xl lg:text-[32px]">
                Our <span className="self-center justify-self-center text-[var(--accent)]">Identity</span>
              </h2>
              <p className="mt-1 text-xs leading-6 justify-self-center text-[#8e8a86] sm:text-[16px]">ตัวตนของเรา</p>
            </div>

            <div className="fade-up text-center text-[#686360] sm:text-left" style={{ transitionDelay: '0.35s' }}>
              <h3 className="text-sm font-semibold text-[#686360] sm:text-base">
                Revolutionizing Asset-Backed Lending
              </h3>
              <p className="mt-3 text-sm leading-6 text-[#8e8a86]">
              Pawnly is a forward-thinking Fintech startup based in Bangkok, Thailand. We were founded with a singular mission: to modernize the traditional secured lending industry through cutting-edge AI technology and a transparent Peer-to-Peer (P2P) ecosystem. We bridge the gap between asset owners and smart investors, making liquidity accessible, safe, and entirely digital.
              </p>
              <h3 className="mt-4 text-sm font-semibold text-[#686360] sm:text-base">
                ปฏิวัติวงการสินเชื่อมีหลักประกัน
              </h3>
              <p className="mt-3 text-sm leading-6 text-[#8e8a86]">
              Pawnly คือสตาร์ทอัพด้านฟินเทค (Fintech) ที่ตั้งอยู่ในกรุงเทพฯ ประเทศไทย เราก่อตั้งขึ้นด้วยพันธกิจเดียวคือ การยกระดับอุตสาหกรรมสินเชื่อมีหลักประกันให้ทันสมัยด้วยเทคโนโลยี AI ที่ล้ำสมัย และระบบนิเวศแบบ Peer-to-Peer (P2P) ที่โปร่งใส เราทำหน้าที่เป็นสะพานเชื่อมระหว่างเจ้าของทรัพย์สินและนักลงทุนที่ชาญฉลาด เพื่อให้การเปลี่ยนทรัพย์สินเป็นทุนนั้นเข้าถึงง่าย ปลอดภัย และเป็นดิจิทัลอย่างเต็มรูปแบบ
              </p>
            </div>
          </div>
        </section>

        <div className="mx-auto flex justify-center px-4 sm:px-6">
          <div className="h-px w-full max-w-[320px] bg-[var(--accent)]" />
        </div>

        <section className="mx-auto w-full max-w-[1216px] px-4 py-16 sm:px-6 sm:py-20 lg:px-14">
          <div className="text-center">
            <h3 className="text-lg font-medium text-[#686360] sm:text-xl lg:text-[32px]">Our Vision & Mission</h3>
            <p className="mt-1 text-[16px] text-[#9a9694]">วิสัยทัศน์และพันธกิจ</p>
          </div>
          <div className="mt-6 flex justify-center">
            <div className="h-px w-full max-w-[980px] bg-[#cfcac7]" />
          </div>

          <div className="mt-10 grid gap-8 text-center sm:mt-12 sm:grid-cols-2 sm:text-left">
            <div className="hover-card fade-up flex flex-col items-center sm:items-start" style={{ transitionDelay: '0.2s' }}>
              <div className="self-center justify-self-center mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#5b5754] text-white">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18h6" />
                  <path d="M10 22h4" />
                  <path d="M12 2a7 7 0 0 0-4 12c.6.6 1 1.3 1 2v1h6v-1c0-.7.4-1.4 1-2a7 7 0 0 0-4-12z" />
                </svg>
              </div>
              <h4 className="self-center justify-self-center text-sm font-semibold text-[#686360]">Vision</h4>
              <p className="text-center self-center justify-self-center mt-2 text-xs leading-5 text-[#8e8a86]">
              To become Southeast Asia’s most trusted digital platform for secured asset matching.
                <br />
                ก้าวสู่การเป็นแพลตฟอร์มดิจิทัลที่น่าเชื่อถือที่สุดในเอเชียตะวันออกเฉียงใต้ สำหรับการจับคู่สินเชื่อมีหลักประกัน
              </p>
            </div>

            <div className="hover-card fade-up flex flex-col items-center sm:items-start" style={{ transitionDelay: '0.3s' }}>
              <div className="self-center justify-self-center mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#5b5754] text-white">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 3v18" />
                  <path d="M4 4h10l-1 4 1 4H4" />
                </svg>
              </div>
              <h4 className="self-center justify-self-center text-sm font-semibold text-[#686360]">Mission</h4>
              <p className="self-center justify-self-center text-center mt-2 text-xs leading-5 text-[#8e8a86]">
              To empower individuals with instant liquidity and provide investors with secure, asset-backed opportunities through seamless Line OA integration and AI precision.
                <br />
                มุ่งเน้นการเสริมสร้างศักยภาพให้บุคคลทั่วไปสามารถเข้าถึงเงินทุนได้ทันที และมอบโอกาสการลงทุนที่มีทรัพย์สินค้ำประกันที่ปลอดภัยให้แก่นักลงทุน ผ่านการใช้งานที่ง่ายบน Line OA และความแม่นยำของ AI
              </p>
            </div>
          </div>
        </section>

        <div className="mx-auto flex justify-center px-4 sm:px-6">
          <div className="h-px w-full max-w-[320px] bg-[var(--accent)]" />
        </div>

        <section className="mx-auto w-full max-w-[1216px] px-4 py-16 sm:px-6 sm:py-20 lg:px-14">
          <div className="fade-up hover-card mx-auto max-w-[980px] rounded-[32px] bg-[#d0cfce] px-4 py-10 text-center text-[#686360] sm:px-12 sm:py-12">
            <h3 className="text-lg font-medium sm:text-xl lg:text-[28px]">Our Commitment to Trust</h3>
            <p className="mt-1 text-sm text-[#686360]/90 sm:text-[18px]">คำมั่นสัญญาแห่งความเชื่อมั่น</p>
            <p className="mt-4 text-sm leading-6 text-[#7f7b78]">
            At Pawnly, trust is our currency. Every transaction is backed by Thai legal frameworks, every asset is secured in premium vaults, and every valuation is verified by AI trained on global market data. We are not just a platform; we are your local partner in financial growth.
            </p>
            <p className="mt-4 text-sm leading-6 text-[#7f7b78]">
            ที่ Pawnly "ความไว้วางใจ" คือหัวใจสำคัญของเรา ทุกธุรกรรมได้รับการคุ้มครองภายใต้กรอบกฎหมายไทย ทรัพย์สินทุกชิ้นถูกจัดเก็บในห้องมั่นคงระดับพรีเมียม และทุกการประเมินราคาถูกยืนยันโดย AI ที่ฝึกฝนจากข้อมูลตลาดโลก เราไม่ได้เป็นเพียงแค่แพลตฟอร์ม แต่เราคือพันธมิตรท้องถิ่นที่จะช่วยให้คุณเติบโตทางการเงิน
            </p>
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
