import Image from 'next/image';
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

        <header className="mx-auto flex w-full max-w-[1216px] items-center justify-between px-6 py-6 lg:px-14">
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

          <nav className={`${montserrat.className} hidden items-center gap-2 rounded-full bg-[#ebebeb] px-3 py-2 text-sm lg:flex`}>
            <button className="rounded-full bg-[var(--sea)] px-3 py-1 text-white">
              หน้าหลัก
            </button>
            <span className="h-4 w-px bg-[var(--line)]" />
            <button className="px-3 py-1 text-[#393939]">ผู้ขอสินเชื่อ</button>
            <span className="h-4 w-px bg-[var(--line)]" />
            <button className="px-3 py-1 text-[#393939]">นักลงทุน</button>
            <span className="h-4 w-px bg-[var(--line)]" />
            <button className="px-3 py-1 text-[#393939]">จุดรับฝาก</button>
            <span className="h-4 w-px bg-[var(--line)]" />
            <button className="px-3 py-1 text-[#393939]">ติดต่อเรา</button>
          </nav>

          <div className={`${montserrat.className} hidden items-center gap-3 lg:flex`}>
            <button className="rounded-full border border-[#999999] px-5 py-2 text-sm text-[#686360]">
              Login
            </button>
            <button className="rounded-full bg-[#686360] px-5 py-2 text-sm text-[#f5f4f2]">
              Join us
            </button>
          </div>
        </header>

        <section className="mx-auto grid w-full max-w-[1216px] items-center gap-12 px-6 pb-16 pt-4 lg:grid-cols-[1.1fr_0.9fr] lg:px-14">
          <div className="fade-up">
            <p className={`${montserrat.className} mb-3 text-xs tracking-[0.3em] text-[#bda9a0]`}>
              Pawnly Platform
            </p>
            <h1 className="text-3xl font-extralight leading-[1.5] text-[#202020] sm:text-4xl lg:text-[50px]">
              ปลดล็อกมูลค่าทรัพย์สิน
              <br />ของคุณ ด้วยเทคโนโลยี <span className="text-[var(--accent)] font-bold">AI</span>
              <br />และการเชื่อมต่อที่เหนือกว่า
            </h1>
            <p className="mt-5 max-w-[620px] text-base text-[var(--muted)] sm:text-lg">
              แพลตฟอร์มสินเชื่อมีหลักประกันแบบ P2P ที่ง่ายที่สุด ประเมินราคาแม่นยำด้วย AI
              และดำเนินการผ่าน Line OA 100% ไม่ต้องเสียเวลาเดินทางไปที่ร้าน
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button className="rounded-full border border-[var(--accent)] px-6 py-2 text-sm text-[var(--accent)]">
                พอว์นลี่เลย! (Start Borrowing)
              </button>
              <button className="rounded-full border border-[var(--accent)] px-6 py-2 text-sm text-[var(--accent)]">
                ลงทุนเลย (Start Investing)
              </button>
            </div>
          </div>
          <div className="fade-up flex justify-center lg:justify-end" style={{ animationDelay: '0.2s' }}>
            <Image
              src="/landing/com1.png"
              alt="Pawnly app previews"
              width={1068}
              height={1068}
              className="h-auto w-full max-w-[460px] drop-shadow-[0_24px_40px_rgba(67,63,60,0.2)]"
              priority
            />
          </div>
        </section>

        <section className="mx-auto w-full max-w-[1216px] px-6 pb-16 lg:px-14">
          <div className="relative flex flex-col items-center">
            <div className="fade-up relative z-10 flex w-full justify-center" style={{ animationDelay: '0.3s' }}>
              <div>
                <Image
                  src="/landing/com2.png"
                  alt="Pawnly UI overview"
                  width={1068}
                  height={868}
                  className="h-auto w-full scale-[0.95]"
                />
              </div>
            </div>

            <div className="fade-up relative z-0 mx-auto -mt-12 w-full max-w-[980px] rounded-[32px] bg-[#d0cfce] px-6 pb-10 pt-14 text-center text-[#686360] sm:-mt-16 sm:px-12 sm:pt-16 lg:-mt-20">
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
              Pawnly คือ แพลตฟอร์มสินเชื่อมีหลักประกันแบบ P2P ที่ทำงานผ่าน Line Official Account (Line OA)
              เป็นหลัก โดยเน้นการสร้างความสะดวกสบายและความรวดเร็วแก่ผู้ขอสินเชื่อ (Pawners) และนักลงทุน
              (Investors)
            </p>
            <button className="mt-6 rounded-full border border-[var(--accent)] px-6 py-2 text-sm text-[var(--accent)]">
              เริ่มต้นเลย
            </button>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[1216px] px-6 pb-16 text-center lg:px-14">
          <div className="fade-up">
            <h3 className="text-xl font-medium text-[#686360] sm:text-2xl">Our Three Pillars</h3>
            <p className="mt-1 text-sm text-[#9a9694]">Our services/Solutions</p>
          </div>
          <div
            className="fade-up mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
            style={{ animationDelay: '0.2s' }}
          >
            <Image
              src={sub1}
              alt="Access to funding for pawners"
              className="h-auto w-full rounded-[28px] shadow-[0_18px_40px_rgba(67,63,60,0.12)]"
            />
            <Image
              src={sub2}
              alt="Stable investment for investors"
              className="h-auto w-full rounded-[28px] shadow-[0_18px_40px_rgba(67,63,60,0.12)]"
            />
            <Image
              src={sub3}
              alt="Business partnerships for drop points"
              className="h-auto w-full rounded-[28px] shadow-[0_18px_40px_rgba(67,63,60,0.12)]"
            />
          </div>
        </section>

        <section className="bg-[#686360] py-16">
          <div className="mx-auto w-full max-w-[1216px] px-6 text-center text-[#f5f4f2] lg:px-14">
            <h3 className="text-xl font-medium sm:text-2xl">Why Pawnly?</h3>
            <div className="mt-10 grid gap-8 md:grid-cols-3">
              {[
                {
                  title: 'Safer First',
                  desc: 'Your valuables are stored in our high-security vaults, monitored 24/7, with full insurance coverage.',
                },
                {
                  title: 'Expert Team',
                  desc: 'Every asset is meticulously verified and appraised with advanced technology to ensure fair and accurate market value.',
                },
                {
                  title: 'Absolute Transparency',
                  desc: 'All agreements are clearly laid out in the Line OA app, with real-time updates and no hidden fees.',
                },
              ].map((item) => (
                <div key={item.title} className="fade-up rounded-2xl px-4 py-6" style={{ animationDelay: '0.2s' }}>
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#f5f4f2] text-[#686360]">
                    <svg
                      width="28"
                      height="28"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="9" />
                      <path d="M8 12l2.5 2.5L16 9" />
                    </svg>
                  </div>
                  <h4 className="text-sm font-semibold">{item.title}</h4>
                  <p className="mt-2 text-sm text-[#e7e5e4]">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[1216px] px-6 pb-20 pt-16 lg:px-14">
          <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
            <div className="fade-up overflow-hidden rounded-[28px]">
              <Image
                src="/landing/com4.png"
                alt="Contact Pawnly"
                width={1200}
                height={936}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="fade-up rounded-[28px] bg-white p-8 shadow-[0_18px_40px_rgba(67,63,60,0.12)]">
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
          <div className="mx-auto flex w-full max-w-[1216px] flex-wrap justify-between gap-10 px-6 py-16 lg:px-14">
            <div className="min-w-[220px]">
              <Image
                src="/landing/pawnly_foot.png"
                alt="Pawnly"
                width={600}
                height={96}
                className="h-8 w-auto"
              />
            </div>
            <div className="grid flex-1 grid-cols-2 gap-8 text-sm sm:grid-cols-4">
              <div>
                <h5 className={`${montserrat.className} text-base font-semibold text-[#d0cfce]`}>Approaches</h5>
                <ul className="mt-3 space-y-2">
                  <li>หน้าหลัก</li>
                  <li>ผู้ขอสินเชื่อ</li>
                  <li>นักลงทุน</li>
                  <li>จุดรับฝาก</li>
                </ul>
              </div>
              <div>
                <h5 className={`${montserrat.className} text-base font-semibold text-[#d0cfce]`}>Company</h5>
                <ul className="mt-3 space-y-2">
                  <li>เกี่ยวกับเรา</li>
                  <li>ติดต่อเรา</li>
                </ul>
              </div>
              <div>
                <h5 className={`${montserrat.className} text-base font-semibold text-[#d0cfce]`}>Follow us</h5>
                <div className="mt-3 flex gap-2">
                  {['F', 'Y', 'X', 'M'].map((label) => (
                    <div
                      key={label}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#686360] text-xs text-[#f0efef]"
                    >
                      {label}
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
