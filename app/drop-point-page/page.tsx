import Image from 'next/image';
import Link from 'next/link';
import { Montserrat, Noto_Sans_Thai } from 'next/font/google';
import com1DropPoint from '../../landind/com1_droppoint.png';

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const notoSansThai = Noto_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['200', '300', '400', '500', '600', '700'],
});

const featureItems = [
  {
    en: 'Additional Income',
    th: 'เพิ่มรายได้',
    desc: 'รับค่าธรรมเนียมจากการรับฝากและตรวจสอบเบื้องต้นผ่านระบบ',
  },
  {
    en: 'Simple Tech',
    th: 'เทคโนโลยีใช้งานง่าย',
    desc: 'ไม่ต้องลงทุนระบบเพิ่ม จัดการทุกอย่างผ่าน Line OA สำหรับร้านค้า',
  },
  {
    en: 'Marketing Support',
    th: 'ทีมช่วยดูแลการตลาด',
    desc: 'ช่วยโปรโมทร้านของคุณผ่านแคมเปญและสื่อของ Pawnly',
  },
  {
    en: 'Scalable Partnership',
    th: 'เติบโตไปพร้อมกัน',
    desc: 'ร่วมเติบโตเป็นส่วนหนึ่งของเครือข่ายพันธมิตรอย่างยั่งยืน',
  },
];

const benefits = [
  {
    title: 'Incremental Service Income',
    desc: 'Earn a steady commission for every asset received, verified, and processed through your location.',
    th: 'รับค่าตอบแทนและค่าธรรมเนียมอย่างสม่ำเสมอในทุกรายการที่มีการรับ-ส่ง และตรวจสอบทรัพย์สินผ่านจุดบริการของคุณ',
    icon: (
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M0 32C0 14.3269 14.3269 0 32 0C49.6731 0 64 14.3269 64 32C64 49.6731 49.6731 64 32 64C14.3269 64 0 49.6731 0 32Z" fill="#F5F4F2"/>
        <path d="M48.5378 23.0285C48.3687 22.6213 48.045 22.2976 47.6378 22.1285C47.4374 22.0431 47.2222 21.9978 47.0045 21.9952H38.6711C38.2291 21.9952 37.8052 22.1708 37.4926 22.4833C37.18 22.7959 37.0045 23.2198 37.0045 23.6618C37.0045 24.1039 37.18 24.5278 37.4926 24.8403C37.8052 25.1529 38.2291 25.3285 38.6711 25.3285H42.9878L33.6711 34.6452L28.1878 29.1452C28.0328 28.989 27.8485 28.865 27.6454 28.7804C27.4423 28.6957 27.2245 28.6522 27.0045 28.6522C26.7844 28.6522 26.5666 28.6957 26.3635 28.7804C26.1604 28.865 25.9761 28.989 25.8211 29.1452L15.8211 39.1452C15.6649 39.3001 15.5409 39.4844 15.4563 39.6875C15.3717 39.8906 15.3281 40.1085 15.3281 40.3285C15.3281 40.5485 15.3717 40.7664 15.4563 40.9695C15.5409 41.1726 15.6649 41.3569 15.8211 41.5118C15.9761 41.668 16.1604 41.792 16.3635 41.8767C16.5666 41.9613 16.7844 42.0048 17.0045 42.0048C17.2245 42.0048 17.4423 41.9613 17.6454 41.8767C17.8485 41.792 18.0329 41.668 18.1878 41.5118L27.0045 32.6785L32.4878 38.1785C32.6427 38.3347 32.8271 38.4587 33.0302 38.5433C33.2333 38.6279 33.4511 38.6715 33.6711 38.6715C33.8911 38.6715 34.109 38.6279 34.3121 38.5433C34.5152 38.4587 34.6995 38.3347 34.8545 38.1785L45.3378 27.6785V31.9952C45.3378 32.4372 45.5134 32.8611 45.8259 33.1737C46.1385 33.4862 46.5624 33.6618 47.0045 33.6618C47.4465 33.6618 47.8704 33.4862 48.183 33.1737C48.4955 32.8611 48.6711 32.4372 48.6711 31.9952V23.6618C48.6685 23.444 48.6232 23.2289 48.5378 23.0285Z" fill="#686360"/>
        </svg>        
    ),
  },
  {
    title: 'Seamless Digital Management',
    desc: 'No complex software or hardware needed. Manage all transactions efficiently via our dedicated Line OA for partners.',
    th: 'ไม่ต้องติดตั้งโปรแกรมหรือซื้ออุปกรณ์เพิ่ม จัดการทุกขั้นตอนได้อย่างรวดเร็วและมีประสิทธิภาพผ่าน Line OA สำหรับพันธมิตรโดยเฉพาะ',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="14" rx="2" />
        <path d="M7 20h10" />
        <path d="M12 8v6" />
        <path d="M9 11h6" />
      </svg>
    ),
  },
  {
    title: 'Optimized Space Utilization',
    desc: 'Transform small, unused areas of your counter or store into a high-value financial service hub with minimal effort.',
    th: 'เปลี่ยนเคาน์เตอร์หรือพื้นที่ว่างเพียงเล็กน้อยที่มีอยู่เดิม ให้กลายเป็นจุดบริการทางการเงินที่มีมูลค่าสูงได้ทันที',
    icon: (
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M0 32C0 14.3269 14.3269 0 32 0C49.6731 0 64 14.3269 64 32C64 49.6731 49.6731 64 32 64C14.3269 64 0 49.6731 0 32Z" fill="#F5F4F2"/>
<path fillRule="evenodd" clipRule="evenodd" d="M31.9987 14.0833C30.9904 14.0833 30.062 14.3333 29.047 14.7533C28.0654 15.16 26.9254 15.7583 25.507 16.5033L22.0604 18.3117C20.3187 19.225 18.927 19.9567 17.8487 20.675C16.7354 21.42 15.8754 22.2033 15.2504 23.265C14.627 24.3233 14.347 25.47 14.212 26.835C14.082 28.16 14.082 29.7883 14.082 31.8383V32.1617C14.082 34.2117 14.082 35.84 14.212 37.165C14.347 38.5317 14.6287 39.6767 15.2504 40.735C15.8754 41.7967 16.7337 42.58 17.8504 43.325C18.9254 44.0433 20.3187 44.775 22.0604 45.6883L25.507 47.4967C26.9254 48.2417 28.0654 48.84 29.047 49.2467C30.0637 49.6667 30.9904 49.9167 31.9987 49.9167C33.007 49.9167 33.9354 49.6667 34.9504 49.2467C35.932 48.84 37.072 48.2417 38.4904 47.4967L41.937 45.69C43.6787 44.775 45.0704 44.0433 46.147 43.325C47.2637 42.58 48.122 41.7967 48.747 40.735C49.3704 39.6767 49.6504 38.53 49.7854 37.165C49.9154 35.84 49.9154 34.2117 49.9154 32.1633V31.8367C49.9154 29.7883 49.9154 28.16 49.7854 26.835C49.6504 25.4683 49.3687 24.3233 48.747 23.265C48.122 22.2033 47.2637 21.42 46.147 20.675C45.072 19.9567 43.6787 19.225 41.937 18.3117L38.4904 16.5033C37.072 15.7583 35.932 15.16 34.9504 14.7533C33.9337 14.3333 33.007 14.0833 31.9987 14.0833ZM26.6154 18.7433C28.0987 17.965 29.1387 17.4217 30.002 17.065C30.842 16.7167 31.4337 16.5833 31.9987 16.5833C32.5654 16.5833 33.1554 16.7167 33.9954 17.065C34.8587 17.4217 35.897 17.965 37.3804 18.7433L40.7137 20.4933C42.5304 21.445 43.8054 22.1167 44.7604 22.7533C45.2304 23.0683 45.5987 23.36 45.8987 23.6533L40.347 26.4283L26.1804 18.9717L26.6154 18.7433ZM23.5737 20.34L23.2837 20.4933C21.467 21.445 20.192 22.1167 19.2387 22.7533C18.8322 23.0175 18.4511 23.3188 18.1004 23.6533L31.9987 30.6033L37.5937 27.8033L23.917 20.6067C23.7888 20.5372 23.6728 20.4471 23.5737 20.34ZM16.8954 25.845C16.812 26.2017 16.747 26.6067 16.7004 27.0783C16.5837 28.2683 16.582 29.7733 16.582 31.9017V32.0967C16.582 34.2267 16.582 35.7317 16.7004 36.92C16.8154 38.0817 17.0337 38.8333 17.4054 39.4667C17.7754 40.095 18.3104 40.6267 19.2387 41.2467C20.192 41.8833 21.467 42.555 23.2837 43.5067L26.617 45.2567C28.1004 46.035 29.1387 46.5783 30.002 46.935C30.2731 47.0472 30.522 47.1389 30.7487 47.21V32.7717L16.8954 25.845ZM33.2487 47.2083C33.4754 47.1383 33.7243 47.0472 33.9954 46.935C34.8587 46.5783 35.897 46.035 37.3804 45.2567L40.7137 43.5067C42.5304 42.5533 43.8054 41.8833 44.7604 41.2467C45.687 40.6267 46.222 40.095 46.5937 39.4667C46.9654 38.8333 47.182 38.0833 47.297 36.92C47.4137 35.7317 47.4154 34.2267 47.4154 32.0983V31.9033C47.4154 29.7733 47.4154 28.2683 47.297 27.08C47.2578 26.6652 47.1927 26.2533 47.102 25.8467L41.582 28.605V33.6667C41.582 33.9982 41.4503 34.3161 41.2159 34.5505C40.9815 34.785 40.6636 34.9167 40.332 34.9167C40.0005 34.9167 39.6826 34.785 39.4481 34.5505C39.2137 34.3161 39.082 33.9982 39.082 33.6667V29.8567L33.2487 32.7733V47.2083Z" fill="#686360"/>
</svg>       
    ),
  },
  {
    title: 'Strategic Network Synergy',
    desc: 'Become part of a modern Fintech ecosystem with future opportunities to integrate with leading courier networks.',
    th: 'ร่วมเป็นส่วนหนึ่งของระบบนิเวศฟินเทคที่ทันสมัย พร้อมโอกาสในการเชื่อมต่อกับเครือข่ายขนส่งพัสดุชั้นนำในอนาคต',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="12" r="2" />
        <circle cx="18" cy="6" r="2" />
        <circle cx="18" cy="18" r="2" />
        <path d="M8 12h7" />
        <path d="M16 8l-4 3" />
        <path d="M16 16l-4-3" />
      </svg>
    ),
  },
  {
    title: 'Enhanced Business Profile',
    desc: 'Boost your local reputation by becoming a "Pawnly Certified" point, trusted for secure asset handling and logistics.',
    th: 'เสริมภาพลักษณ์ร้านค้าของคุณให้เป็นจุดบริการที่น่าเชื่อถือในฐานะ "Pawnly Certified" ที่เชี่ยวชาญด้านการจัดการทรัพย์สินที่ปลอดภัย',
    icon: (
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M0 32C0 14.3269 14.3269 0 32 0C49.6731 0 64 14.3269 64 32C64 49.6731 49.6731 64 32 64C14.3269 64 0 49.6731 0 32Z" fill="#F5F4F2"/>
        <path d="M29.6423 15.5C30.2323 14.9108 31.0217 14.5641 31.8547 14.5283C32.6878 14.4925 33.504 14.7702 34.1423 15.3067L34.3556 15.5017L37.5223 18.6667H41.999C42.8396 18.6668 43.6492 18.9846 44.2655 19.5564C44.8818 20.1282 45.2593 20.9117 45.3223 21.75L45.3323 22V26.4767L48.499 29.6433C49.0886 30.2334 49.4356 31.0231 49.4714 31.8566C49.5072 32.69 49.2292 33.5066 48.6923 34.145L48.4973 34.3567L45.3306 37.5233V42C45.3309 42.841 45.0133 43.6509 44.4415 44.2676C43.8697 44.8842 43.0859 45.2619 42.2473 45.325L41.999 45.3333H37.524L34.3573 48.5C33.7672 49.0897 32.9775 49.4367 32.1441 49.4725C31.3107 49.5083 30.4941 49.2303 29.8556 48.6933L29.644 48.5L26.4773 45.3333H21.999C21.158 45.3336 20.348 45.016 19.7314 44.4442C19.1148 43.8724 18.737 43.0886 18.674 42.25L18.6656 42V37.5233L15.499 34.3567C14.9093 33.7666 14.5623 32.9769 14.5265 32.1434C14.4907 31.31 14.7687 30.4935 15.3056 29.855L15.499 29.6433L18.6656 26.4767V22C18.6658 21.1593 18.9836 20.3498 19.5554 19.7335C20.1271 19.1172 20.9107 18.7397 21.749 18.6767L21.999 18.6667H26.4756L29.6423 15.5ZM31.999 17.86L28.8323 21.0267C28.2787 21.5794 27.5483 21.9198 26.769 21.9883L26.4756 22H21.999V26.4767C21.9992 27.2598 21.7236 28.018 21.2206 28.6183L21.0223 28.835L17.8556 32.0017L21.0223 35.1667C21.5757 35.72 21.9167 36.4505 21.9856 37.23L21.999 37.5233V42H26.4756C27.2588 41.9998 28.017 42.2754 28.6173 42.7783L28.834 42.9767L31.999 46.1433L35.1656 42.9767C35.719 42.4233 36.4494 42.0823 37.229 42.0133L37.5223 42H41.999V37.5233C41.9988 36.7402 42.2743 35.982 42.7773 35.3817L42.9756 35.165L46.1423 32L42.9756 28.8333C42.4223 28.28 42.0813 27.5495 42.0123 26.77L41.999 26.4767V22H37.5223C36.7392 22.0002 35.9809 21.7246 35.3806 21.2217L35.164 21.0233L31.9973 17.8567L31.999 17.86ZM37.1323 26.9733C37.4322 26.6744 37.8347 26.5009 38.2579 26.488C38.6812 26.475 39.0935 26.6237 39.4111 26.9037C39.7287 27.1838 39.9278 27.5743 39.968 27.9958C40.0081 28.4173 39.8863 28.8383 39.6273 29.1733L39.4873 29.33L31.354 37.4633C31.0364 37.7813 30.6132 37.9715 30.1646 37.998C29.716 38.0244 29.2733 37.8851 28.9206 37.6067L28.7606 37.465L24.754 33.4583C24.4519 33.1591 24.2756 32.7557 24.2612 32.3308C24.2468 31.9058 24.3953 31.4914 24.6764 31.1724C24.9575 30.8533 25.3499 30.6538 25.7733 30.6147C26.1967 30.5755 26.6191 30.6996 26.954 30.9617L27.1106 31.1L30.0573 34.0467L37.1323 26.9733Z" fill="#686360"/>
        </svg>        
    ),
  },
];

const partnerSteps = [
  { step: '1', title: 'Register', desc: 'แอดไลน์ ลงทะเบียนและส่งเอกสารเพื่อยืนยันตัวตนร้านค้า' },
  { step: '2', title: 'Setup', desc: 'รับอุปกรณ์มาตรฐานและสติกเกอร์สัญลักษณ์ Pawnly Drop Point' },
  { step: '3', title: 'Receive', desc: 'ให้บริการรับทรัพย์สินจากลูกค้า และตรวจสอบความถูกต้องเบื้องต้นตามคำแนะนำในระบบ' },
  { step: '4', title: 'Earn', desc: 'รับรายได้ค่าตอบแทนสะสม และถอนเงินได้ทันทีตามรอบบัญชี' },
];

export default function DropPointPage() {
  return (
    <div className={`${notoSansThai.className} bg-[var(--bg)] text-[var(--ink)]`}>
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-32 right-[-12%] h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle_at_center,rgba(239,172,120,0.28),rgba(245,244,242,0))]" />
        <div className="pointer-events-none absolute top-[30%] left-[-10%] h-[240px] w-[240px] rounded-full bg-[radial-gradient(circle_at_center,rgba(206,160,120,0.2),rgba(245,244,242,0))]" />
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
            <button className="rounded-full bg-[var(--muted-2)] px-4 py-1.5 text-white transition-all duration-300 hover:scale-105 hover:shadow-md">
              จุดรับฝาก
            </button>
            <span className="h-6 w-px bg-[var(--line)]" />
            <Link href="/about">
              <button className="px-3 py-1 text-[var(--muted-2)] transition-all duration-300 hover:text-[var(--accent)] hover:scale-105">
                เกี่ยวกับเรา
              </button>
            </Link>
          </nav>

          <div className={`${montserrat.className} hidden items-center gap-3 lg:flex`}>
            <a
              href="#contact-us"
              className="rounded-full bg-[#686360] px-4 py-1.5 text-xs text-[#f5f4f2] transition-colors hover:bg-[#4f4a47] cursor-pointer"
            >
              Talk to us
            </a>
          </div>
          <div className="relative lg:hidden">
            <input id="mobile-menu-drop" type="checkbox" className="peer sr-only" />
            <label
              htmlFor="mobile-menu-drop"
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
              htmlFor="mobile-menu-drop"
              className="fixed inset-0 z-40 bg-black/40 opacity-0 backdrop-blur-sm transition-opacity duration-300 peer-checked:opacity-100 peer-checked:pointer-events-auto pointer-events-none"
              aria-hidden="true"
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center opacity-0 transition-all duration-300 peer-checked:opacity-100 peer-checked:pointer-events-auto pointer-events-none">
              <div className="w-[min(92vw,360px)] rounded-[28px] bg-[#f5f4f2] p-6 shadow-[0_20px_50px_rgba(44,42,40,0.2)] translate-y-4 scale-95 transition-all duration-300 peer-checked:translate-y-0 peer-checked:scale-100">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-[#686360]">เมนู</p>
                  <label
                    htmlFor="mobile-menu-drop"
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
                  <div className="rounded-2xl bg-[#686360] px-4 py-3 text-sm text-white">
                    จุดรับฝาก
                  </div>
                  <Link
                    href="/about"
                    className="block rounded-2xl px-4 py-3 text-sm transition-colors duration-200 hover:bg-[#efeeed]"
                  >
                    เกี่ยวกับเรา
                  </Link>
                </div>
                <div className="mt-5 grid gap-2">
                  <a
                    href="#contact-us"
                    className="w-full rounded-full bg-[#686360] px-4 py-2 text-center text-xs text-[#f5f4f2] transition-colors hover:bg-[#4f4a47] cursor-pointer"
                  >
                    Talk to us
                  </a>
                </div>
              </div>
            </div>
          </div>
        </header>

        <section className="mx-auto grid w-full max-w-[1216px] items-start gap-10 px-4 pb-16 pt-4 sm:gap-12 sm:px-6 sm:pb-20 sm:pt-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:px-14 lg:pb-24">
          <div className="fade-up reveal-left text-center sm:text-left lg:pt-6">
            <h1 className="max-w-[520px] text-[32px] font-light leading-[1.4] text-[#686360] sm:text-5xl lg:text-[48px]">
              เปลี่ยนพื้นที่ว่างในร้าน...
              <br />ให้เป็นรายได้ใหม่กับเรา
            </h1>
            <p className="mt-4 max-w-[520px] text-sm leading-6 text-[#9a9694] mx-auto sm:mx-0 sm:text-[18px] sm:leading-7">
              ร่วมเป็นเครือข่ายจุดรับฝากทรัพย์สิน (Drop Point) ของ Pawnly
              <br className="hidden sm:block" />
              เพื่อรับค่าธรรมเนียมและเพิ่มฐานลูกค้าให้ร้าน
            </p>
            <div className="mt-5 flex flex-wrap justify-center sm:justify-start">
              <button className="btn-sheen rounded-full border border-[var(--accent)] px-6 py-2 text-sm text-[var(--accent)] shadow-[0_8px_18px_rgba(197,81,37,0.25)] transition-colors duration-300 hover:bg-[var(--accent)] hover:text-white sm:px-9 sm:py-4 sm:text-[16px] cursor-pointer">
                เริ่มเลย!
              </button>
            </div>
          </div>
          <div className="fade-up reveal-right flex flex-col items-center gap-2 sm:items-end sm:gap-3" style={{ transitionDelay: '0.2s' }}>
            <Image
              src={com1DropPoint}
              alt="Drop point partnership"
              className="h-auto w-full max-w-[320px] rounded-[24px] shadow-[0_18px_32px_rgba(67,63,60,0.18)] transition-transform duration-300 hover:scale-105 sm:max-w-[380px] lg:max-w-[430px]"
              priority
            />
          </div>
        </section>

        <section className="mx-auto w-full max-w-[1216px] px-4 pb-16 pt-6 sm:px-6 sm:pb-20 lg:px-14">
          <div className="flex justify-center">
            <div className="h-px w-full max-w-[320px] bg-[var(--accent)]" />
          </div>
          <div className="mt-12 grid items-center gap-8 sm:gap-10 md:grid-cols-[0.9fr_1.1fr] md:gap-12 lg:gap-16">
            <div className="fade-up text-center" style={{ transitionDelay: '0.3s' }}>
              <h2 className="mt-2 text-2xl font-medium text-[#686360] sm:text-3xl lg:text-[32px]">
                Why <span className="text-[var(--accent)]">Pawnly</span> for You?
              </h2>
              <p className="mt-1 text-xs text-[#8e8a86]">ทำไมต้องพอว์นลี่</p>
            </div>

            <div className="fade-up w-full mx-auto lg:ml-auto" style={{ transitionDelay: '0.4s' }}>
              <div className="flex flex-col gap-2 w-full max-w-[520px] rounded-[20px] bg-[#d8d6d4] p-3 sm:p-4 shadow-[0_18px_36px_rgba(67,63,60,0.08)]">
                {featureItems.map((item) => (
                  <div key={item.en} className="hover-card rounded-[14px] bg-[#cfcac7] px-4 py-3">
                    <div className="flex flex-row flex-wrap items-center gap-3 sm:flex-nowrap">
                      <div className="flex-none">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <circle cx="8" cy="8" r="8" fill="#686360"/>
                          <path d="M4.5 8L6.5 10L11.5 5" stroke="#D0CFCE" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <div className="text-[11px] text-[#686360] sm:text-xs">
                        {item.en}
                      </div>
                      <div className="ml-auto flex h-[20px] items-center justify-center rounded-full bg-[#efeeed] px-2.5 sm:h-[22px] sm:px-3">
                        <span className="text-[10px] text-[#686360] sm:text-[11px]">{item.th}</span>
                      </div>
                    </div>
                    <p className="mt-2 text-[10px] leading-5 text-[#7f7b78] sm:text-[11px]">
                      {item.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[#686360] py-12 sm:py-16">
          <div className="mx-auto w-full max-w-[1216px] px-4 text-center text-[#f5f4f2] sm:px-6 lg:px-14">
            <h3 className="text-lg font-medium sm:text-xl lg:text-[32px]">Benefits</h3>
            <p className="mt-1 text-[16px] text-[#c8b8b0]">ผลประโยชน์ของจุดรับฝาก</p>
            <div className="mt-4 flex justify-center sm:mt-6">
              <div className="h-px w-full max-w-[980px] bg-[var(--accent)]" />
            </div>

            <div className="fade-up mt-6 grid gap-6 sm:mt-8 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
              {benefits.map((item) => (
                <div key={item.title} className="hover-card flex flex-col items-center rounded-2xl px-2 py-3 text-center">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#f5f4f2] text-[#686360] sm:h-12 sm:w-12">
                    {item.icon}
                  </div>
                  <h4 className="text-[12px] font-semibold text-[#f5f4f2]">{item.title}</h4>
                  <p className="mt-2 text-[12px] leading-relaxed text-[#e7e5e4] whitespace-pre-line">
                    {item.desc}
                    {'\n'}
                    {item.th}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[1216px] px-4 py-16 sm:px-6 sm:py-20 lg:px-14">
          <div className="mb-10 text-center">
            <h3 className="text-lg font-medium text-[#686360] sm:text-xl lg:text-[32px]">Partner Process</h3>
            <p className="mt-1 text-[16px] text-[#9a9694]">ขั้นตอนของจุดรับฝาก</p>
          </div>

          <div className="fade-up grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {partnerSteps.map((item) => (
              <div key={item.step} className="hover-card rounded-[20px] bg-[#c8c5c2] px-4 py-6 text-center shadow-[0_14px_26px_rgba(67,63,60,0.12)] sm:px-5 sm:py-8">
                <div className="text-[40px] font-semibold leading-none text-[#f5f4f2] sm:text-[44px] lg:text-[48px]">{item.step}</div>
                <h4 className="mt-3 text-base font-semibold text-[#FAFAF9] sm:text-lg lg:text-[22px]">{item.title}</h4>
                <p className="mt-2 text-xs leading-5 text-[#FAFAF9] sm:text-sm lg:text-[14px]">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="contact-us" className="mx-auto w-full max-w-[1216px] px-4 pb-16 pt-2 sm:px-6 sm:pb-20 lg:px-14">
          <div className="fade-up rounded-[34px] bg-[#d8d6d4] px-8 py-10 text-[#686360] sm:px-14 sm:py-14">
            <h3 className="text-5xl font-light leading-tight sm:text-6xl">Wanna talk?</h3>
            <p className="mt-2 text-2xl">คุยกับเรา</p>
            <p className="mt-8 max-w-[860px] text-2xl leading-relaxed">
              Speak with our experts. Schedule a consultation at a time that works best for you.
              Book your session below.
            </p>
            <p className="mt-4 max-w-[860px] text-2xl leading-relaxed">
              ปรึกษาผู้เชี่ยวชาญของเราโดยตรงนัดหมายวันและเวลาที่คุณสะดวกเพื่อพูดคุยรายละเอียด
              จองเวลาได้ที่นี่
            </p>
            <div className="mt-10 flex justify-center sm:justify-start">
              <a
                href="https://calendar.google.com/calendar"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-12 py-4 text-xl text-white transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-[var(--accent)]/30 cursor-pointer"
              >
                Book a date and time
              </a>
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
                    )}
                  ].map((social) => (
                    <a
                      key={social.name}
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-[#3a3633] text-[#d0cfce] transition-colors duration-300 hover:bg-[#4a4644] cursor-pointer"
                      title={social.name}
                    >
                      {social.icon}
                    </a>
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
