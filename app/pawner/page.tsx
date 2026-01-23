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
              <Link href="https://lin.ee/yX4oRny" target="_blank" rel="noopener noreferrer">
                <button className="btn-sheen rounded-full border border-[var(--accent)] px-6 py-1.5 text-xs text-[var(--accent)] shadow-[0_8px_18px_rgba(197,81,37,0.25)] transition-colors duration-300 hover:bg-[var(--accent)] hover:text-white">
                  เริ่มเลย!
                </button>
              </Link>
            </div>
          </div>
          <div className="fade-up flex flex-col items-center gap-3" style={{ animationDelay: '0.2s' }}>
            <div className="relative float-slow">
              <div className="pointer-events-none absolute -inset-6 rounded-[30px] bg-[radial-gradient(circle_at_top,rgba(255,210,165,0.65),rgba(245,244,242,0))] blur-2xl opacity-70 glow-pulse" />
              <div className="pointer-events-none absolute -right-10 -top-8 h-24 w-24 rounded-full bg-[#f2d3be] blur-2xl opacity-60 float-slower" />
              <Image
                src="/landing/com1_pawner.png"
                alt="Pawner app preview"
                width={1068}
                height={1068}
                className="relative z-10 h-auto w-full max-w-[430px] rounded-[24px] shadow-[0_18px_32px_rgba(67,63,60,0.18)]"
                priority
              />
            </div>
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
              <div className="relative flex flex-col gap-2 w-full max-w-[520px] rounded-[20px] bg-[#d8d6d4] p-4 soft-card overflow-hidden">
                <div className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.7),rgba(216,214,212,0))] blur-2xl opacity-70 glow-pulse" />
                <div className="pointer-events-none absolute -left-8 -bottom-10 h-28 w-28 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.5),rgba(216,214,212,0))] blur-2xl opacity-60 float-slower" />
                {[
                  { en: 'Digital Item Listing', th: 'ลงรายการทรัพย์สินดิจิทัล' },
                  { en: 'AI Appraisal Tool', th: 'เครื่องมือประเมินด้วย AI' },
                  { en: 'Loan Status Tracking', th: 'ติดตามสถานะสินเชื่อ' },
                  { en: 'Secure Messaging', th: 'แชทส่วนตัวปลอดภัย' },
                  { en: 'Digital Loan Agreements', th: 'ทำสัญญาดิจิทัล' },
                ].map((item) => (
                  <div key={item.en} className="relative z-10 flex flex-row items-center gap-3 rounded-[14px] bg-[#cfcac7] px-4 py-2.5 transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-[0_10px_18px_rgba(67,63,60,0.18)]">
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

        <section className="relative overflow-hidden bg-[#686360] py-16">
          <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.22),rgba(104,99,96,0))] blur-3xl glow-pulse" />
          <div className="pointer-events-none absolute bottom-[-40px] right-10 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.14),rgba(104,99,96,0))] blur-3xl float-slower" />
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
                <div key={item.title} className="flex flex-col items-center text-center transition-transform duration-300 hover:-translate-y-1">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#f5f4f2] text-[#686360]">
                    {item.title.includes('Capital') && (
                      <svg width="28" height="28" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M0 32C0 14.3269 14.3269 0 32 0C49.6731 0 64 14.3269 64 32C64 49.6731 49.6731 64 32 64C14.3269 64 0 49.6731 0 32Z" fill="#F5F4F2"/>
                        <path d="M34.6211 33.25H31.2328C30.7135 33.2504 30.2105 33.4314 29.8101 33.7621C29.4097 34.0927 29.1368 34.5524 29.0383 35.0622C28.9398 35.5721 29.0217 36.1003 29.27 36.5564C29.5184 37.0124 29.9177 37.3678 30.3994 37.5617L33.8394 38.9383C34.3212 39.1322 34.7205 39.4876 34.9688 39.9436C35.2172 40.3997 35.2991 40.9279 35.2006 41.4378C35.102 41.9476 34.8291 42.4073 34.4287 42.7379C34.0284 43.0686 33.5254 43.2496 33.0061 43.25H29.6211M32.1211 33.25V32M32.1211 44.5V43.25M23.3711 25.75H40.8711M38.0478 20.3933L40.4444 15.6C40.5615 15.3654 40.6019 15.0999 40.5598 14.8411C40.5177 14.5823 40.3953 14.3433 40.2099 14.1579C40.0245 13.9725 39.7855 13.8501 39.5267 13.808C39.2679 13.7659 39.0024 13.8062 38.7678 13.9233L35.6011 15.5033C35.3286 15.6393 35.0159 15.6712 34.7216 15.593C34.4273 15.5147 34.1717 15.3317 34.0028 15.0783L33.1644 13.8067C33.0503 13.6355 32.8956 13.4951 32.7142 13.398C32.5328 13.3009 32.3302 13.2501 32.1244 13.2501C31.9187 13.2501 31.7161 13.3009 31.5347 13.398C31.3532 13.4951 31.1986 13.6355 31.0844 13.8067L30.2361 15.0783C30.0672 15.3317 29.8116 15.5147 29.5173 15.593C29.223 15.6712 28.9102 15.6393 28.6378 15.5033L25.4761 13.9233C25.2414 13.8068 24.9761 13.7668 24.7175 13.8091C24.4589 13.8513 24.2201 13.9737 24.0347 14.1589C23.8493 14.344 23.7268 14.5827 23.6843 14.8413C23.6417 15.0998 23.6814 15.3652 23.7978 15.6L26.1478 20.3" stroke="#686360" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M24.0607 29.5L19.4607 34.8333C18.335 36.2966 17.6415 38.0457 17.4587 39.8828C17.276 41.7198 17.6112 43.5713 18.4264 45.2277C19.2417 46.884 20.5044 48.279 22.0716 49.2547C23.6388 50.2304 25.4479 50.7478 27.294 50.7483H36.944C38.7901 50.7478 40.5992 50.2304 42.1664 49.2547C43.7336 48.279 44.9963 46.884 45.8116 45.2277C46.6268 43.5713 46.9621 41.7198 46.7793 39.8828C46.5965 38.0457 45.903 36.2966 44.7773 34.8333L40.1773 29.5" stroke="#686360" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                    {item.title.includes('Terms') && (
                      <svg width="28" height="28" viewBox="0 0 64 68" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M0 34C0 16.3269 14.3269 2 32 2C49.6731 2 64 16.3269 64 34C64 51.6731 49.6731 66 32 66C14.3269 66 0 51.6731 0 34Z" fill="#F5F4F2"/>
                        <path fillRule="evenodd" clipRule="evenodd" d="M45.332 17.3333C46.2161 17.3333 47.0639 17.6845 47.6891 18.3096C48.3142 18.9348 48.6654 19.7826 48.6654 20.6667V40.6667C48.6654 41.5507 48.3142 42.3986 47.6891 43.0237C47.0639 43.6488 46.2161 44 45.332 44H40.332V47.3333C40.332 48.2174 39.9808 49.0652 39.3557 49.6904C38.7306 50.3155 37.8828 50.6667 36.9987 50.6667H18.6654C17.7813 50.6667 16.9335 50.3155 16.3083 49.6904C15.6832 49.0652 15.332 48.2174 15.332 47.3333V29C15.332 28.1159 15.6832 27.2681 16.3083 26.643C16.9335 26.0179 17.7813 25.6667 18.6654 25.6667H21.9987V20.6667C21.9987 19.7826 22.3499 18.9348 22.975 18.3096C23.6001 17.6845 24.448 17.3333 25.332 17.3333H45.332ZM21.9987 29H18.6654V47.3333H36.9987V44H25.332C24.448 44 23.6001 43.6488 22.975 43.0237C22.3499 42.3986 21.9987 41.5507 21.9987 40.6667V29ZM41.8154 26.0533C41.5284 25.7664 41.1465 25.594 40.7415 25.5685C40.3365 25.543 39.936 25.6662 39.6154 25.915L39.457 26.0533L33.5637 31.9467L31.207 29.59C30.9071 29.2911 30.5046 29.1175 30.0814 29.1046C29.6581 29.0917 29.2458 29.2404 28.9282 29.5204C28.6106 29.8005 28.4115 30.1909 28.3714 30.6125C28.3312 31.034 28.453 31.455 28.712 31.79L28.8504 31.9467L32.267 35.3633C32.5846 35.6813 33.0078 35.8715 33.4564 35.898C33.905 35.9244 34.3477 35.7851 34.7004 35.5067L34.8604 35.365L41.8137 28.4117C41.9687 28.2569 42.0916 28.0731 42.1755 27.8707C42.2593 27.6684 42.3025 27.4515 42.3025 27.2325C42.3025 27.0135 42.2593 26.7966 42.1755 26.5943C42.0916 26.3919 41.9703 26.2081 41.8154 26.0533Z" fill="#686360"/>
                      </svg>
                    )}
                    {item.title.includes('Direct') && (
                      <svg width="28" height="28" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M0 32C0 14.3269 14.3269 0 32 0C49.6731 0 64 14.3269 64 32C64 49.6731 49.6731 64 32 64C14.3269 64 0 49.6731 0 32Z" fill="#F5F4F2"/>
                        <path d="M35.332 43.6667C41.617 43.6667 44.7604 43.6667 46.712 41.7133C48.6637 39.76 48.6654 36.6183 48.6654 30.3333C48.6654 24.0483 48.6654 20.905 46.712 18.9533C44.7587 17.0017 41.617 17 35.332 17H28.6654C22.3804 17 19.237 17 17.2854 18.9533C15.3337 20.9067 15.332 24.0483 15.332 30.3333C15.332 36.6183 15.332 39.7617 17.2854 41.7133C18.3737 42.8033 19.832 43.285 21.9987 43.4967" stroke="#686360" strokeWidth="3.33333" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M27 30.3333L30.75 33.6667L37 27" stroke="#686360" strokeWidth="3.33333" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M35.3328 43.6667C33.2728 43.6667 31.0028 44.5 28.9311 45.575C25.6011 47.3033 23.9361 48.1683 23.1161 47.6167C22.2961 47.065 22.4511 45.3583 22.7628 41.9433L22.8328 41.1667" stroke="#686360" strokeWidth="3.33333" strokeLinecap="round"/>
                      </svg>
                    )}
                    {item.title.includes('Wider') && (
                      <svg width="28" height="28" viewBox="0 0 64 68" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M0 34C0 16.3269 14.3269 2 32 2C49.6731 2 64 16.3269 64 34C64 51.6731 49.6731 66 32 66C14.3269 66 0 51.6731 0 34Z" fill="#F5F4F2"/>
                        <path fillRule="evenodd" clipRule="evenodd" d="M30.125 19.625C30.4702 19.625 30.75 19.9048 30.75 20.25V32.125C30.75 32.4702 30.4702 32.75 30.125 32.75H18.25C17.9048 32.75 17.625 32.4702 17.625 32.125V20.25C17.625 19.9048 17.9048 19.625 18.25 19.625H30.125ZM28.0938 22.2812H20.2812V30.0938H28.0938V22.2812ZM47.3646 25.7065C47.6086 25.9505 47.6086 26.3463 47.3646 26.5904L40.2935 33.6614C40.0494 33.9055 39.6537 33.9055 39.4096 33.6614L32.3386 26.5904C32.0945 26.3463 32.0945 25.9505 32.3386 25.7065L39.4096 18.6354C39.6537 18.3913 40.0494 18.3913 40.2935 18.6354L47.3646 25.7065ZM44.05 26.1484L39.8516 21.95L35.6531 26.1484L39.8516 30.3469L44.05 26.1484ZM30.125 35.25C30.4702 35.25 30.75 35.5298 30.75 35.875V47.75C30.75 48.0952 30.4702 48.375 30.125 48.375H18.25C17.9048 48.375 17.625 48.0952 17.625 47.75V35.875C17.625 35.5298 17.9048 35.25 18.25 35.25H30.125ZM28.0938 37.9062H20.2812V45.7188H28.0938V37.9062ZM45.75 35.25C46.0952 35.25 46.375 35.5298 46.375 35.875V47.75C46.375 48.0952 46.0952 48.375 45.75 48.375H33.875C33.5298 48.375 33.25 48.0952 33.25 47.75V35.875C33.25 35.5298 33.5298 35.25 33.875 35.25H45.75ZM43.7188 37.9062H35.9062V45.7188H43.7188V37.9062Z" fill="#686360"/>
                      </svg>
                    )}
                    {item.title.includes('Flexibility') && (
                      <svg width="28" height="28" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M0 32C0 14.3269 14.3269 0 32 0C49.6731 0 64 14.3269 64 32C64 49.6731 49.6731 64 32 64C14.3269 64 0 49.6731 0 32Z" fill="#F5F4F2"/>
                        <path d="M43.25 52C45.5706 52 47.7962 51.0781 49.4372 49.4372C51.0781 47.7962 52 45.5706 52 43.25C52 40.9294 51.0781 38.7038 49.4372 37.0628C47.7962 35.4219 45.5706 34.5 43.25 34.5C40.9294 34.5 38.7038 35.4219 37.0628 37.0628C35.4219 38.7038 34.5 40.9294 34.5 43.25C34.5 45.5706 35.4219 47.7962 37.0628 49.4372C38.7038 51.0781 40.9294 52 43.25 52ZM47.4475 40.7675L44.11 46.3325C43.9633 46.577 43.7628 46.7848 43.5238 46.9402C43.2847 47.0955 43.0134 47.1943 42.7304 47.229C42.4474 47.2637 42.1602 47.2334 41.8907 47.1405C41.6212 47.0475 41.3764 46.8943 41.175 46.6925L39.24 44.76C39.0053 44.5253 38.8734 44.2069 38.8734 43.875C38.8734 43.5431 39.0053 43.2247 39.24 42.99C39.4747 42.7553 39.7931 42.6234 40.125 42.6234C40.4569 42.6234 40.7753 42.7553 41.01 42.99L42.3775 44.36L45.3025 39.4825C45.3869 39.3417 45.4982 39.2188 45.63 39.121C45.7619 39.0231 45.9117 38.9522 46.0709 38.9123C46.2302 38.8724 46.3958 38.8642 46.5582 38.8883C46.7206 38.9123 46.8767 38.9681 47.0175 39.0525C47.1583 39.1369 47.2812 39.2482 47.379 39.38C47.4769 39.5119 47.5478 39.6617 47.5877 39.8209C47.6276 39.9802 47.6358 40.1458 47.6117 40.3082C47.5877 40.4706 47.5319 40.6267 47.4475 40.7675ZM39.5 24.5C39.5 26.4891 38.7098 28.3968 37.3033 29.8033C35.8968 31.2098 33.9891 32 32 32C30.0109 32 28.1032 31.2098 26.6967 29.8033C25.2902 28.3968 24.5 26.4891 24.5 24.5C24.5 22.5109 25.2902 20.6032 26.6967 19.1967C28.1032 17.7902 30.0109 17 32 17C33.9891 17 35.8968 17.7902 37.3033 19.1967C38.7098 20.6032 39.5 22.5109 39.5 24.5ZM32 29.5C33.3261 29.5 34.5979 28.9732 35.5355 28.0355C36.4732 27.0979 37 25.8261 37 24.5C37 23.1739 36.4732 21.9021 35.5355 20.9645C34.5979 20.0268 33.3261 19.5 32 19.5C30.6739 19.5 29.4021 20.0268 28.4645 20.9645C27.5268 21.9021 27 23.1739 27 24.5C27 25.8261 27.5268 27.0979 28.4645 28.0355C29.4021 28.9732 30.6739 29.5 32 29.5Z" fill="#686360"/>
                        <path d="M32.64 47C32.3537 46.188 32.1617 45.3458 32.0675 44.49H19.5C19.5025 43.875 19.885 42.025 21.58 40.33C23.21 38.7 26.2775 37 32 37C32.65 37 33.2667 37.0208 33.85 37.0625C34.415 36.21 35.09 35.4375 35.86 34.7675C34.6933 34.5925 33.4067 34.5033 32 34.5C19.5 34.5 17 42 17 44.5C17 47 19.5 47 19.5 47H32.64Z" fill="#686360"/>
                      </svg>
                    )}
                    {!item.title.match(/Capital|Terms|Direct|Wider|Flexibility/) && (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" fill="#686360" />
                      </svg>
                    )}
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
            <p className="mt-1 text-[20] text-[#9a9694]">4 ขั้นตอนง่ายๆ</p>
          </div>

          <div className="grid gap-6 md:grid-cols-4">
            {[
              { step: '1', title: 'Add Line', desc: 'แอดไลน์ของผู้ขอสินเชื่อ\nและลงทะเบียนง่ายๆ ใน 1 นาที', href: 'https://lin.ee/yX4oRny' },
              { step: '2', title: 'Upload & Appraise', desc: 'ถ่ายรูปทรัพย์สินเพื่อรับการประเมินราคาเบื้องต้นด้วย AI' },
              { step: '3', title: 'Offer & Match', desc: 'รอรับข้อเสนอสินเชื่อจากนักลงทุนภายใน 4 ชั่วโมง' },
              { step: '4', title: 'Drop & Fund', desc: 'นำทรัพย์สินไปฝากที่ Drop Point หรือเลือกบริการรับของ\nเพื่อรับเงินโอนเข้าบัญชีทันที' },
            ].map((item) => {
              const cardClasses =
                'rounded-[20px] bg-[#c8c5c2] px-5 py-8 text-center soft-card transition-transform duration-300 hover:-translate-y-1 hover:shadow-[0_16px_28px_rgba(67,63,60,0.18)]';

              const content = (
                <>
                  <div className="text-[48px] font-semibold leading-none text-[#f5f4f2]">{item.step}</div>
                  <h4 className="mt-3 text-[22px] font-semibold text-[#FAFAF9]">{item.title}</h4>
                  <p className="mt-2 text-[14px] leading-5 text-[#FAFAF9] whitespace-pre-line">{item.desc}</p>
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
