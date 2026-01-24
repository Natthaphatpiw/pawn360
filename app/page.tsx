import Image from 'next/image';
import Link from 'next/link';
import { Montserrat, Noto_Sans_Thai } from 'next/font/google';
import sub1 from '../landind/sub1.png';
import sub2 from '../landind/sub2.png';
import sub3 from '../landind/sub3.png';

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const notoSansThai = Noto_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['200', '300', '400', '500', '600', '700'],
});

export default function Home() {
  return (
    <div className={`${notoSansThai.className} bg-[var(--bg)] text-[var(--ink)]`}>
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-40 right-[-10%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,rgba(255,181,92,0.35),rgba(245,244,242,0))]" />
        <div className="pointer-events-none absolute top-[20%] left-[-6%] h-[260px] w-[260px] rounded-full bg-[radial-gradient(circle_at_center,rgba(240,160,120,0.25),rgba(245,244,242,0))]" />

        <header className="mx-auto flex w-full max-w-[1216px] items-center justify-between px-4 py-4 sm:px-6 sm:py-6 lg:px-14 font-extralight">
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

          <nav className="hidden items-center gap-2 text-sm lg:flex font-semibold">
            <Link href="/">
              <button className="rounded-full bg-[var(--muted-2)] px-4 py-1.5 text-white transition-all duration-300 hover:scale-105 hover:shadow-md">
                หน้าหลัก
              </button>
            </Link>
            <span className="h-6 w-px bg-[var(--line)]" />
            <Link href="/pawner">
              <button className="px-3 py-1 text-[var(--muted-2)] transition-all duration-300 hover:text-[var(--accent)] hover:scale-105">ผู้ขอสินเชื่อ</button>
            </Link>
            <span className="h-6 w-px bg-[var(--line)]" />
            <Link href="/investor">
              <button className="px-3 py-1 text-[var(--muted-2)] transition-all duration-300 hover:text-[var(--accent)] hover:scale-105">นักลงทุน</button>
            </Link>
            <span className="h-6 w-px bg-[var(--line)]" />
            <Link href="/drop-point-page">
              <button className="px-3 py-1 text-[var(--muted-2)] transition-all duration-300 hover:text-[var(--accent)] hover:scale-105">จุดรับฝาก</button>
            </Link>
            <span className="h-6 w-px bg-[var(--line)]" />
            <Link href="/about">
              <button className="px-3 py-1 text-[var(--muted-2)] transition-all duration-300 hover:text-[var(--accent)] hover:scale-105">เกี่ยวกับเรา</button>
            </Link>
          </nav>

          <div className={`${montserrat.className} hidden items-center gap-3 lg:flex`}>
            <button className="rounded-full border border-[#999999] px-5 py-2 text-sm text-[#686360]">
              Login
            </button>
            <button className="rounded-full bg-[#686360] px-5 py-2 text-sm text-[#f5f4f2]">
              Join us
            </button>
          </div>
          <div className="relative lg:hidden">
            <input id="mobile-menu-home" type="checkbox" className="peer sr-only" />
            <label
              htmlFor="mobile-menu-home"
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
              htmlFor="mobile-menu-home"
              className="fixed inset-0 z-40 bg-black/40 opacity-0 backdrop-blur-sm transition-opacity duration-300 peer-checked:opacity-100 peer-checked:pointer-events-auto pointer-events-none"
              aria-hidden="true"
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center opacity-0 transition-all duration-300 peer-checked:opacity-100 peer-checked:pointer-events-auto pointer-events-none">
              <div className="w-[min(92vw,360px)] rounded-[28px] bg-[#f5f4f2] p-6 shadow-[0_20px_50px_rgba(44,42,40,0.2)] translate-y-4 scale-95 transition-all duration-300 peer-checked:translate-y-0 peer-checked:scale-100">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-[#686360]">เมนู</p>
                  <label
                    htmlFor="mobile-menu-home"
                    className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-[#e2e0dd] text-[#686360] transition-colors duration-200 hover:border-[#cfcac7]"
                    aria-label="ปิดเมนู"
                  >
                    <span className="text-lg leading-none">×</span>
                  </label>
                </div>
                <div className="mt-4 space-y-2 text-[#686360]">
                  <div className="rounded-2xl bg-[#686360] px-4 py-3 text-sm text-white">
                    หน้าหลัก
                  </div>
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
                  <Link
                    href="/about"
                    className="block rounded-2xl px-4 py-3 text-sm transition-colors duration-200 hover:bg-[#efeeed]"
                  >
                    เกี่ยวกับเรา
                  </Link>
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

        <section className="mx-auto grid w-full max-w-[1216px] items-center gap-12 px-4 pb-16 pt-4 sm:px-6 sm:pb-20 lg:grid-cols-[1.1fr_0.9fr] lg:px-14">
          <div className="fade-up text-center sm:text-left">
            <p className={`${montserrat.className} mb-3 text-xs tracking-[0.3em] text-[#bda9a0]`}>
              Pawnly Platform
            </p>
            <h1 className="text-3xl font-extralight leading-[1.5] text-[#202020] sm:text-4xl lg:text-[50px]">
              ปลดล็อกมูลค่าทรัพย์สิน
              <br />ของคุณ ด้วยเทคโนโลยี <span className="text-[var(--accent)] font-bold">AI</span>
              <br />และการเชื่อมต่อที่เหนือกว่า
            </h1>
            <p className="mt-5 max-w-[620px] text-base text-[var(--muted)] sm:text-lg mx-auto sm:mx-0">
              แพลตฟอร์มสินเชื่อมีหลักประกันแบบ P2P ที่ง่ายที่สุด ประเมินราคาแม่นยำด้วย AI
              และดำเนินการผ่าน Line OA 100% ไม่ต้องเสียเวลาเดินทางไปที่ร้าน
            </p>
            <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <Link href="/pawner">
                <button className="group w-full rounded-full border border-[var(--accent)] bg-transparent px-6 py-2 text-sm text-[var(--accent)] transition-all duration-300 hover:scale-105 hover:bg-[var(--accent)] hover:text-white hover:shadow-lg hover:shadow-[var(--accent)]/25 sm:w-auto">
                  ต้องการเงินทุน (Start Borrowing)
                </button>
              </Link>
              <Link href="/investor">
                <button className="group w-full rounded-full border border-[var(--accent)] bg-transparent px-6 py-2 text-sm text-[var(--accent)] transition-all duration-300 hover:scale-105 hover:bg-[var(--accent)] hover:text-white hover:shadow-lg hover:shadow-[var(--accent)]/25 sm:w-auto">
                  สนใจลงทุน (Start Investing)
                </button>
              </Link>
            </div>
          </div>
          <div className="fade-up flex justify-center lg:justify-end" style={{ animationDelay: '0.2s' }}>
            <Image
              src="/landing/com1.png"
              alt="Pawnly app previews"
              width={1068}
              height={1068}
              className="h-auto w-full max-w-[360px] drop-shadow-[0_24px_40px_rgba(67,63,60,0.2)] hover:scale-105 hover:rotate-1 transition-all duration-500 cursor-pointer sm:max-w-[420px] lg:max-w-[460px]"
              priority
            />
          </div>
        </section>

        <section className="mx-auto w-full max-w-[1216px] px-4 pb-16 sm:px-6 lg:px-14">
          <div className="relative flex flex-col items-center">
            <div className="fade-up relative z-10 flex w-full justify-center" style={{ animationDelay: '0.3s' }}>
              <div>
                <Image
                  src="/landing/com2.png"
                  alt="Pawnly UI overview"
                  width={1068}
                  height={868}
                  className="h-auto w-full scale-[0.95] hover:scale-[1] hover:-rotate-1 transition-all duration-500 cursor-pointer"
                />
              </div>
            </div>

            <div className="fade-up relative z-0 mx-auto -mt-10 w-full max-w-[980px] rounded-[32px] bg-[#d0cfce] px-4 pb-10 pt-12 text-center text-[#686360] sm:-mt-16 sm:px-12 sm:pt-16 lg:-mt-20">
            <h2 className="text-2xl font-medium sm:text-3xl lg:text-[40px]">
              What is <span className="text-[var(--accent)]">Pawnly</span>?
            </h2>
            <p className="mt-2 text-sm text-[#8e8a86]">พอว์นลี่คืออะไร</p>
            <p className="mt-4 text-sm leading-6 sm:text-base">
              Pawnly is an innovative, fully digital P2P Secured Lending Platform that operates primarily through a
              Line Official Account (Line OA) interface. Its core function is to connect individuals seeking loans
              against their assets (Pawners) directly with private investors who fund those loans.
            </p>
            <p className="mt-4 text-sm leading-6 sm:text-base">
            Pawnly คือ แพลตฟอร์มสินเชื่อมีหลักประกันแบบ P2P ที่ทำงานผ่าน Line Official Account (Line OA) เป็นหลัก โดยเน้นการสร้างความสะดวกสบายและความรวดเร็วแก่ ผู้ขอสินเชื่อ (Pawners) และการจัดหาสิ่งอำนวยความสะดวกสำหรับ นักลงทุน (Investors) เพื่อให้สามารถให้สินเชื่อโดยตรงได้ง่ายขึ้น
            </p>
            <Link href="/about" className="mt-6">
            <button className="mt-6 rounded-full border border-[var(--accent)] bg-transparent px-6 py-2 text-sm text-[var(--accent)] transition-all duration-300 hover:scale-105 hover:bg-[var(--accent)] hover:text-white hover:shadow-lg hover:shadow-[var(--accent)]/25">
              อ่านเพิ่มเติม
            </button>
            </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[1216px] px-4 pb-16 text-center sm:px-6 lg:px-14">
          <div className="fade-up">
            <h3 className="text-xl font-medium text-[#686360] sm:text-2xl">Our Three Pillars</h3>
            <p className="mt-1 text-sm text-[#9a9694]">Our services/Solutions</p>
          </div>
          <div
            className="fade-up mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
            style={{ animationDelay: '0.2s' }}
          >
            <Link href="/pawner">
              <Image
                src={sub1}
                alt="Access to funding for pawners"
                className="h-auto w-full rounded-[28px] shadow-[0_18px_40px_rgba(67,63,60,0.12)] hover:scale-105 hover:shadow-[0_25px_50px_rgba(67,63,60,0.2)] transition-all duration-300 cursor-pointer"
              />
            </Link>
            <Link href="/investor">
              <Image
                src={sub2}
                alt="Stable investment for investors"
                className="h-auto w-full rounded-[28px] shadow-[0_18px_40px_rgba(67,63,60,0.12)] hover:scale-105 hover:shadow-[0_25px_50px_rgba(67,63,60,0.2)] transition-all duration-300 cursor-pointer"
              />
            </Link>
            <Link href="/drop-point-page">
              <Image
                src={sub3}
                alt="Business partnerships for drop points"
                className="h-auto w-full rounded-[28px] shadow-[0_18px_40px_rgba(67,63,60,0.12)] hover:scale-105 hover:shadow-[0_25px_50px_rgba(67,63,60,0.2)] transition-all duration-300 cursor-pointer"
              />
            </Link>
          </div>
        </section>

        <section className="bg-[#686360] py-12 sm:py-16">
          <div className="mx-auto w-full max-w-[1216px] px-4 text-center text-[#f5f4f2] sm:px-6 lg:px-14">
            <h3 className="text-xl font-medium sm:text-[45px] leading-[1.5]">Why Pawnly?</h3>
            <div className="mt-8 grid gap-6 sm:mt-10 sm:grid-cols-2 lg:mt-12 lg:grid-cols-3">
              {[
                {
                  title: 'Safety First',
                  desc: 'Your valuables are stored in our high-security vaults, monitored 24/7, and fully covered by premium insurance for your ultimate peace of mind.\n ทรัพย์สินของคุณจะถูกจัดเก็บในห้องมั่นคงที่มีระบบรักษาความปลอดภัย 24 ชั่วโมง พร้อมการคุ้มครองจากประกันภัยเต็มวงเงิน เพื่อความสบายใจสูงสุดของคุณ',
                },
                {
                  title: 'Expert Team',
                  desc: 'Every asset is meticulously verified by our experienced appraisal team, working in tandem with advanced AI technology to ensure fair and accurate market valuations.\n ทรัพย์สินทุกชิ้นผ่านการตรวจสอบอย่างละเอียดโดยทีมผู้เชี่ยวชาญเฉพาะทาง ร่วมกับเทคโนโลยี AI ที่ทันสมัย เพื่อให้มั่นใจในความแม่นยำและการประเมินมูลค่าที่เป็นธรรมตามราคาตลาด',
                },
                {
                  title: 'Absolute Transparency',
                  desc: 'All agreements are legally binding and fully transparent. You can monitor your asset status, loan details, and payment schedules in real-time through Line OA.\n ทุกสัญญาจัดทำอย่างถูกต้องตามกฎหมายและมีความโปร่งใสสูงสุด คุณสามารถติดตามสถานะทรัพย์สิน รายละเอียดสินเชื่อ และกำหนดการชำระเงินได้แบบเรียลไทม์ผ่าน Line OA',
                },
              ].map((item) => (
                <div key={item.title} className="fade-up rounded-2xl px-4 py-6 transition-all duration-300 hover:scale-[1.02] hover:bg-[#686360]/10 hover:shadow-lg hover:shadow-[#686360]/10 cursor-pointer" style={{ animationDelay: '0.2s' }}>
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#f5f4f2] text-[#686360]">
                  {item.title === 'Safety First' && (
                    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M0 32C0 14.3269 14.3269 0 32 0C49.6731 0 64 14.3269 64 32C64 49.6731 49.6731 64 32 64C14.3269 64 0 49.6731 0 32Z" fill="#F5F4F2"/>
<path d="M17 43.6667V20.3333C17 19.4493 17.3512 18.6014 17.9763 17.9763C18.6014 17.3512 19.4493 17 20.3333 17H43.6667C44.5507 17 45.3986 17.3512 46.0237 17.9763C46.6488 18.6014 47 19.4493 47 20.3333V43.6667C47 44.5507 46.6488 45.3986 46.0237 46.0237C45.3986 46.6488 44.5507 47 43.6667 47H20.3333C19.4493 47 18.6014 46.6488 17.9763 46.0237C17.3512 45.3986 17 44.5507 17 43.6667Z" stroke="#686360" strokeWidth="2.5"/>
<path d="M42.0007 35.3333V28.6667M32.834 27.8333L34.5007 26.1667M24.5007 27.8333L22.834 26.1667M22.834 37.8333L24.5007 36.1667M34.5007 37.8333L32.834 36.1667M15.334 25.3333H17.0007M15.334 22H17.0007M17.0007 38.6667H15.334M17.0007 42H15.334M28.6673 37C27.3412 37 26.0695 36.4732 25.1318 35.5355C24.1941 34.5979 23.6673 33.3261 23.6673 32C23.6673 30.6739 24.1941 29.4021 25.1318 28.4645C26.0695 27.5268 27.3412 27 28.6673 27C29.9934 27 31.2652 27.5268 32.2029 28.4645C33.1405 29.4021 33.6673 30.6739 33.6673 32C33.6673 33.3261 33.1405 34.5979 32.2029 35.5355C31.2652 36.4732 29.9934 37 28.6673 37Z" stroke="#686360" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
</svg>
                  )}
                  {item.title === 'Expert Team' && (
                    <svg width="64" height="68" viewBox="0 0 64 68" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M0 34C0 16.3269 14.3269 2 32 2C49.6731 2 64 16.3269 64 34C64 51.6731 49.6731 66 32 66C14.3269 66 0 51.6731 0 34Z" fill="#F5F4F2"/>
<path d="M36.6489 29.7143C37.5013 29.7143 38.3189 30.053 38.9217 30.6558C39.5245 31.2586 39.8631 32.0761 39.8631 32.9286V41.8558C39.8631 43.94 39.0352 45.9388 37.5614 47.4126C36.0876 48.8864 34.0888 49.7143 32.0046 49.7143C29.9203 49.7143 27.9215 48.8864 26.4477 47.4126C24.9739 45.9388 24.146 43.94 24.146 41.8558V32.9286C24.146 32.0761 24.4846 31.2586 25.0874 30.6558C25.6902 30.053 26.5078 29.7143 27.3603 29.7143H36.6489ZM36.6489 31.8572H27.3603C27.0761 31.8572 26.8036 31.9701 26.6027 32.171C26.4017 32.3719 26.2889 32.6445 26.2889 32.9286V41.8558C26.2889 43.3717 26.891 44.8255 27.9629 45.8974C29.0349 46.9693 30.4887 47.5715 32.0046 47.5715C33.5205 47.5715 34.9743 46.9693 36.0462 45.8974C37.1181 44.8255 37.7203 43.3717 37.7203 41.8558V32.9286C37.7203 32.6445 37.6074 32.3719 37.4065 32.171C37.2055 31.9701 36.933 31.8572 36.6489 31.8572ZM18.0717 29.7143H24.0089C23.4351 30.3114 23.0321 31.0514 22.8417 31.8572H18.0717C17.7875 31.8572 17.515 31.9701 17.3141 32.171C17.1132 32.3719 17.0003 32.6445 17.0003 32.9286V40.4272C16.9997 41.1441 17.179 41.8497 17.5218 42.4794C17.8645 43.1091 18.3597 43.6428 18.9621 44.0315C19.5645 44.4203 20.2548 44.6517 20.9697 44.7046C21.6847 44.7575 22.4015 44.6302 23.0546 44.3343C23.2446 45.0343 23.5174 45.7001 23.8603 46.3229C22.8815 46.7506 21.8117 46.9277 20.7473 46.8382C19.6829 46.7487 18.6577 46.3954 17.7641 45.8103C16.8705 45.2251 16.1369 44.4265 15.6294 43.4867C15.1219 42.5468 14.8566 41.4953 14.8574 40.4272V32.9286C14.8574 32.0761 15.1961 31.2586 15.7989 30.6558C16.4017 30.053 17.2192 29.7143 18.0717 29.7143ZM45.9289 29.7143C46.7813 29.7143 47.5989 30.053 48.2017 30.6558C48.8045 31.2586 49.1431 32.0761 49.1431 32.9286V40.4286C49.1436 41.496 48.8782 42.5467 48.371 43.4859C47.8639 44.425 47.1308 45.2232 46.238 45.8082C45.3453 46.3932 44.3209 46.7467 43.2573 46.8368C42.1937 46.9269 41.1245 46.7508 40.146 46.3243L40.226 46.1786C40.5317 45.5986 40.7789 44.9829 40.956 44.3372C41.6087 44.6309 42.3246 44.7564 43.0383 44.7024C43.752 44.6483 44.4407 44.4164 45.0418 44.0277C45.6428 43.6391 46.1369 43.1061 46.479 42.4774C46.8211 41.8487 47.0003 41.1444 47.0003 40.4286V32.9286C47.0003 32.6447 46.8876 32.3724 46.687 32.1715C46.4864 31.9706 46.2142 31.8576 45.9303 31.8572H41.1689C40.9781 31.0512 40.5745 30.3112 40.0003 29.7143H45.9289ZM32.0003 18.2858C32.6569 18.2858 33.3071 18.4151 33.9137 18.6664C34.5203 18.9176 35.0715 19.2859 35.5358 19.7502C36.0001 20.2145 36.3684 20.7657 36.6197 21.3723C36.871 21.979 37.0003 22.6292 37.0003 23.2858C37.0003 23.9424 36.871 24.5926 36.6197 25.1992C36.3684 25.8058 36.0001 26.357 35.5358 26.8213C35.0715 27.2856 34.5203 27.6539 33.9137 27.9052C33.3071 28.1564 32.6569 28.2858 32.0003 28.2858C30.6742 28.2858 29.4024 27.759 28.4647 26.8213C27.5271 25.8836 27.0003 24.6118 27.0003 23.2858C27.0003 21.9597 27.5271 20.6879 28.4647 19.7502C29.4024 18.8126 30.6742 18.2858 32.0003 18.2858ZM43.4331 19.7143C43.9959 19.7143 44.5532 19.8252 45.0732 20.0406C45.5932 20.2559 46.0656 20.5716 46.4636 20.9696C46.8616 21.3676 47.1772 21.84 47.3926 22.36C47.608 22.8799 47.7189 23.4372 47.7189 24.0001C47.7189 24.5629 47.608 25.1202 47.3926 25.6401C47.1772 26.1601 46.8616 26.6325 46.4636 27.0305C46.0656 27.4285 45.5932 27.7442 45.0732 27.9595C44.5532 28.1749 43.9959 28.2858 43.4331 28.2858C42.2965 28.2858 41.2064 27.8342 40.4027 27.0305C39.599 26.2268 39.1474 25.1367 39.1474 24.0001C39.1474 22.8634 39.599 21.7733 40.4027 20.9696C41.2064 20.1659 42.2965 19.7143 43.4331 19.7143ZM20.5674 19.7143C21.1302 19.7143 21.6875 19.8252 22.2075 20.0406C22.7275 20.2559 23.1999 20.5716 23.5979 20.9696C23.9958 21.3676 24.3115 21.84 24.5269 22.36C24.7423 22.8799 24.8531 23.4372 24.8531 24.0001C24.8531 24.5629 24.7423 25.1202 24.5269 25.6401C24.3115 26.1601 23.9958 26.6325 23.5979 27.0305C23.1999 27.4285 22.7275 27.7442 22.2075 27.9595C21.6875 28.1749 21.1302 28.2858 20.5674 28.2858C19.4308 28.2858 18.3407 27.8342 17.537 27.0305C16.7332 26.2268 16.2817 25.1367 16.2817 24.0001C16.2817 22.8634 16.7332 21.7733 17.537 20.9696C18.3407 20.1659 19.4308 19.7143 20.5674 19.7143ZM32.0003 20.4286C31.2425 20.4286 30.5158 20.7296 29.98 21.2655C29.4442 21.8013 29.1431 22.528 29.1431 23.2858C29.1431 24.0435 29.4442 24.7703 29.98 25.3061C30.5158 25.8419 31.2425 26.1429 32.0003 26.1429C32.758 26.1429 33.4848 25.8419 34.0206 25.3061C34.5564 24.7703 34.8574 24.0435 34.8574 23.2858C34.8574 22.528 34.5564 21.8013 34.0206 21.2655C33.4848 20.7296 32.758 20.4286 32.0003 20.4286ZM43.4331 21.8572C43.1517 21.8572 42.8731 21.9126 42.6131 22.0203C42.3531 22.128 42.1169 22.2858 41.9179 22.4848C41.7189 22.6838 41.5611 22.92 41.4534 23.18C41.3457 23.44 41.2903 23.7186 41.2903 24.0001C41.2903 24.2815 41.3457 24.5601 41.4534 24.8201C41.5611 25.0801 41.7189 25.3163 41.9179 25.5153C42.1169 25.7143 42.3531 25.8721 42.6131 25.9798C42.8731 26.0875 43.1517 26.1429 43.4331 26.1429C44.0015 26.1429 44.5465 25.9171 44.9484 25.5153C45.3502 25.1134 45.576 24.5684 45.576 24.0001C45.576 23.4317 45.3502 22.8867 44.9484 22.4848C44.5465 22.083 44.0015 21.8572 43.4331 21.8572ZM20.5674 21.8572C20.286 21.8572 20.0074 21.9126 19.7474 22.0203C19.4874 22.128 19.2512 22.2858 19.0522 22.4848C18.8532 22.6838 18.6954 22.92 18.5877 23.18C18.48 23.44 18.4246 23.7186 18.4246 24.0001C18.4246 24.2815 18.48 24.5601 18.5877 24.8201C18.6954 25.0801 18.8532 25.3163 19.0522 25.5153C19.2512 25.7143 19.4874 25.8721 19.7474 25.9798C20.0074 26.0875 20.286 26.1429 20.5674 26.1429C21.1357 26.1429 21.6808 25.9171 22.0827 25.5153C22.4845 25.1134 22.7103 24.5684 22.7103 24.0001C22.7103 23.4317 22.4845 22.8867 22.0827 22.4848C21.6808 22.083 21.1357 21.8572 20.5674 21.8572Z" fill="#686360"/>
</svg>
                  )}
                  {item.title === 'Absolute Transparency' && (
                    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M0 32C0 14.3269 14.3269 0 32 0C49.6731 0 64 14.3269 64 32C64 49.6731 49.6731 64 32 64C14.3269 64 0 49.6731 0 32Z" fill="#F5F4F2"/>
                      <path d="M17 19.75V32C17 44.25 32 49.5 32 49.5C32 49.5 47 44.25 47 32V19.75L32 14.5L17 19.75Z" stroke="#686360" strokeWidth="3.33333" strokeLinecap="square"/>
                      <path d="M25.6211 30.62L30.3328 35.3334L39.7611 25.905" stroke="#686360" strokeWidth="3.33333" strokeLinecap="square"/>
                    </svg>
                  )}
                  </div>
                  <h4 className="text-sm font-semibold">{item.title}</h4>
                  <p className="mt-2 text-sm text-[#e7e5e4] whitespace-pre-line">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[1216px] px-4 pb-16 pt-12 sm:px-6 sm:pb-20 sm:pt-16 lg:px-14">
          <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-stretch">
            <div className="fade-up overflow-hidden rounded-[28px]">
              <Image
                src="/landing/com4.png"
                alt="Contact Pawnly"
                width={1200}
                height={936}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="fade-up rounded-[28px] bg-white p-6 shadow-[0_18px_40px_rgba(67,63,60,0.12)] sm:p-8">
              <h3 className="text-2xl font-medium text-[#686360] sm:text-3xl">Contact us</h3>
              <form className="mt-6 space-y-4">
                <div>
                  <label className={`${montserrat.className} text-xs font-semibold text-[#393939]`}>Email</label>
                  <input
                    type="email"
                    placeholder="email@email.com"
                    className="mt-2 w-full rounded-xl bg-[#f5f4f2] px-4 py-2 text-sm text-[#686360] placeholder:text-[#999999]"
                  />
                </div>
                <div>
                  <label className={`${montserrat.className} text-xs font-semibold text-[#393939]`}>Fullname</label>
                  <input
                    type="text"
                    placeholder="Name"
                    className="mt-2 w-full rounded-xl bg-[#f5f4f2] px-4 py-2 text-sm text-[#686360] placeholder:text-[#999999]"
                  />
                </div>
                <div>
                  <label className={`${montserrat.className} text-xs font-semibold text-[#393939]`}>Phone number</label>
                  <input
                    type="tel"
                    placeholder="Phone number"
                    className="mt-2 w-full rounded-xl bg-[#f5f4f2] px-4 py-2 text-sm text-[#686360] placeholder:text-[#999999]"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full rounded-full bg-[var(--accent)] px-6 py-2 text-sm text-white"
                >
                  Submit
                </button>
              </form>
            </div>
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
