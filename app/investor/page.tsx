import Image from 'next/image';
import Link from 'next/link';
import { Montserrat, Noto_Sans_Thai } from 'next/font/google';
import com1Investor from '../../landind/com1_investor.png';
import com2Investor from '../../landind/com2_investor.png';
import com3Investor from '../../landind/com3_investor.png';
import com4Investor from '../../landind/com4_investor.png';

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const notoSansThai = Noto_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['200', '300', '400', '500', '600', '700'],
});

const featureItems = [
  { en: 'List of pawners', th: 'รายชื่อผู้ขอสินเชื่อทั้งหมด' },
  { en: 'Evaluation system', th: 'ระบบประเมินราคา' },
  { en: 'Asset storage', th: 'การจัดเก็บทรัพย์' },
  { en: 'Status tracking', th: 'การติดตามสถานะ' },
  { en: 'Contract management', th: 'จัดการสัญญา' },
];

const benefits = [
  {
    title: 'Asset-Backed Security',
    desc: 'Your investments are secured by tangible, verifiable assets physically held.',
    th: 'การลงทุนของคุณได้รับการคุ้มครอง โดยสินทรัพย์ที่จับต้องได้และตรวจ สอบได้ซึ่งได้รับการถือครอง',
    icon: (
      <svg width="64" height="68" viewBox="0 0 64 68" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M0 34C0 16.3269 14.3269 2 32 2C49.6731 2 64 16.3269 64 34C64 51.6731 49.6731 66 32 66C14.3269 66 0 51.6731 0 34Z" fill="#F5F4F2"/>
        <path d="M31.9987 50.6667H30.147C23.1637 50.6667 19.672 50.6667 17.502 48.575C15.332 46.4817 15.332 43.115 15.332 36.3817V27.3333M15.332 27.3333H48.6654M15.332 27.3333L16.9354 23.4867C18.177 20.5033 18.7987 19.0133 20.0587 18.1733C21.3187 17.3333 22.932 17.3333 26.1654 17.3333H37.832C41.0637 17.3333 42.6787 17.3333 43.9387 18.1733C45.1987 19.0133 45.8204 20.505 47.062 23.4867L48.6654 27.3333M48.6654 27.3333V33.1667M31.9987 27.3333V17.3333M28.6654 34H35.332" stroke="#686360" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M39.895 40.9583V38.64C39.895 38.2967 39.9083 37.95 40.0317 37.63C40.3583 36.78 41.2233 35.6633 42.7983 35.6633C44.375 35.6633 45.275 36.78 45.6017 37.63C45.725 37.95 45.7383 38.2967 45.7383 38.64V40.9567M40.01 50.6667H45.6567C47.3183 50.6667 48.6667 49.3217 48.6667 47.6633V44.325C48.6667 42.6667 47.3183 41.3217 45.6567 41.3217H40.01C38.3483 41.3217 37 42.6667 37 44.325V47.6633C37 49.3217 38.3483 50.6667 40.01 50.6667Z" stroke="#686360" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    title: 'More Competitive Offers',
    desc: 'Discover a unique alternative investment class offering attractive interest rates and steady returns.',
    th: 'ค้นพบทางเลือกการลงทุนอันเป็น เอกลักษณ์ที่ให้ดอกเบี้ยที่น่าดึงดูดและ ผลตอบแทนคงที่',
    icon: (
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M0 32C0 14.3269 14.3269 0 32 0C49.6731 0 64 14.3269 64 32C64 49.6731 49.6731 64 32 64C14.3269 64 0 49.6731 0 32Z" fill="#F5F4F2"/>
        <path d="M48.875 42C48.875 42.4973 48.6775 42.9742 48.3258 43.3258C47.9742 43.6775 47.4973 43.875 47 43.875H37.1469C36.5663 43.8767 35.9968 43.7157 35.503 43.4102C35.0092 43.1048 34.6109 42.6671 34.3531 42.1469L26.4656 26.375H17C16.5027 26.375 16.0258 26.1775 15.6742 25.8258C15.3225 25.4742 15.125 24.9973 15.125 24.5C15.125 24.0027 15.3225 23.5258 15.6742 23.1742C16.0258 22.8225 16.5027 22.625 17 22.625H26.8531C27.4337 22.6233 28.0032 22.7843 28.497 23.0898C28.9908 23.3952 29.3891 23.8329 29.6469 24.3531L37.5344 40.125H47C47.4973 40.125 47.9742 40.3225 48.3258 40.6742C48.6775 41.0258 48.875 41.5027 48.875 42ZM35.75 26.375H47C47.4973 26.375 47.9742 26.1775 48.3258 25.8258C48.6775 25.4742 48.875 24.9973 48.875 24.5C48.875 24.0027 48.6775 23.5258 48.3258 23.1742C47.9742 22.8225 47.4973 22.625 47 22.625H35.75C35.2527 22.625 34.7758 22.8225 34.4242 23.1742C34.0725 23.5258 33.875 24.0027 33.875 24.5C33.875 24.9973 34.0725 25.4742 34.4242 25.8258C34.7758 26.1775 35.2527 26.375 35.75 26.375Z" fill="#686360"/>
      </svg>
    ),
  },
  {
    title: 'Diversify Your Portfolio',
    desc: 'Add a new layer of stability and opportunity to your investments with secured, short-term loans.',
    th: 'เพิ่มเสถียรภาพและโอกาสใหม่ให้กับ การลงทุนของคุณด้วยสินเชื่อระยะสั้นที่ปลอดภัย',
    icon: (
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M0 32C0 14.3269 14.3269 0 32 0C49.6731 0 64 14.3269 64 32C64 49.6731 49.6731 64 32 64C14.3269 64 0 49.6731 0 32Z" fill="#F5F4F2"/>
<path d="M33.17 15.6583L44.8367 20.0333C45.4722 20.2716 46.0198 20.6981 46.4064 21.2559C46.793 21.8138 47.0001 22.4763 47 23.155V32.0933C47.0001 34.879 46.2244 37.6097 44.7599 39.9794C43.2954 42.3491 41.1999 44.2642 38.7083 45.51L33.1183 48.305C32.7711 48.4787 32.3882 48.5691 32 48.5691C31.6118 48.5691 31.2289 48.4787 30.8817 48.305L25.2917 45.51C22.8001 44.2642 20.7046 42.3491 19.2401 39.9794C17.7756 37.6097 16.9999 34.879 17 32.0933V23.155C16.9999 22.4763 17.207 21.8138 17.5936 21.2559C17.9802 20.6981 18.5278 20.2716 19.1633 20.0333L30.83 15.6583C31.5844 15.3756 32.4156 15.3756 33.17 15.6583ZM32 18.78L20.3333 23.155V32.0933C20.3337 34.2598 20.9373 36.3833 22.0765 38.2261C23.2157 40.0688 24.8455 41.558 26.7833 42.5267L32 45.1383L37.2167 42.53C39.155 41.561 40.7851 40.0714 41.9244 38.228C43.0636 36.3846 43.6669 34.2603 43.6667 32.0933V23.155L32 18.78ZM32 25.3333C32.7114 25.333 33.4043 25.5604 33.9773 25.9821C34.5503 26.4038 34.9733 26.9978 35.1845 27.6772C35.3956 28.3566 35.3839 29.0857 35.151 29.7579C34.9181 30.4302 34.4762 31.0102 33.89 31.4133L33.6667 31.555V37C33.6662 37.4248 33.5035 37.8334 33.2119 38.1423C32.9203 38.4512 32.5217 38.6371 32.0977 38.662C31.6736 38.6868 31.256 38.5489 30.9303 38.2762C30.6045 38.0036 30.3952 37.6168 30.345 37.195L30.3333 37V31.555C29.6971 31.1885 29.1996 30.6221 28.9183 29.9438C28.637 29.2656 28.5874 28.5134 28.7774 27.8041C28.9674 27.0949 29.3863 26.4682 29.9691 26.0214C30.5518 25.5746 31.2657 25.3327 32 25.3333Z" fill="#686360"/>
</svg>
    ),
  },
  {
    title: 'Direct & Transparent Access',
    desc: 'Browse items posted by pawners, view detailed appraisals, and engage directly to fund loans that meet your criteria.',
    th: 'เรียกดูรายการที่ผู้ขอสินเชื่อเสนอ ดูการประเมินราคาโดยละเอียด และมีส่วนร่วมโดยตรงในการระดมทุนสินเชื่อที่ตรงตามเกณฑ์ของคุณ',
    icon: (
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M0 32C0 14.3269 14.3269 0 32 0C49.6731 0 64 14.3269 64 32C64 49.6731 49.6731 64 32 64C14.3269 64 0 49.6731 0 32Z" fill="#F5F4F2"/>
<path d="M26.9987 22H45.332M20.332 22.0167L20.3487 21.9983M20.332 32.0167L20.3487 31.9983M18.332 41.6667L19.6654 43L22.9987 39.6667M26.9987 32H45.332M26.9987 42H45.332" stroke="#686360" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
</svg>
    ),
  },
  {
    title: 'Manage Your Portfolio',
    desc: 'Utilize an intuitive dashboard to track your investments, disburse funds, and monitor your returns with ease.',
    th: 'ใช้แดชบอร์ดที่ใช้งานง่ายเพื่อติดตามการลงทุนของคุณ จ่ายเงิน และตรวจสอบผลตอบแทนของคุณได้อย่างง่ายดาย',
    icon: (
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M0 32C0 14.3269 14.3269 0 32 0C49.6731 0 64 14.3269 64 32C64 49.6731 49.6731 64 32 64C14.3269 64 0 49.6731 0 32Z" fill="#F5F4F2"/>
<path d="M41.9987 43.6667C42.9154 43.6667 43.7004 43.3406 44.3537 42.6883C45.007 42.0361 45.3331 41.2511 45.332 40.3333C45.3309 39.4156 45.0048 38.6311 44.3537 37.98C43.7026 37.3289 42.9176 37.0022 41.9987 37C41.0798 36.9978 40.2954 37.3244 39.6454 37.98C38.9954 38.6356 38.6687 39.42 38.6654 40.3333C38.662 41.2467 38.9887 42.0317 39.6454 42.6883C40.302 43.345 41.0865 43.6711 41.9987 43.6667ZM41.6654 48.6667C41.2765 48.6667 40.9365 48.5417 40.6454 48.2917C40.3543 48.0417 40.1665 47.7222 40.082 47.3333L39.832 46.1667C39.4987 46.0278 39.1865 45.8822 38.8954 45.73C38.6043 45.5778 38.3054 45.39 37.9987 45.1667L36.7904 45.5417C36.4293 45.6528 36.0754 45.6389 35.7287 45.5C35.382 45.3611 35.1109 45.1389 34.9154 44.8333L34.582 44.25C34.3876 43.9167 34.3181 43.5556 34.3737 43.1667C34.4293 42.7778 34.6098 42.4583 34.9154 42.2083L35.832 41.4167C35.7765 41.0833 35.7487 40.7222 35.7487 40.3333C35.7487 39.9444 35.7765 39.5833 35.832 39.25L34.9154 38.4583C34.6098 38.2083 34.4293 37.8961 34.3737 37.5217C34.3181 37.1472 34.3876 36.7928 34.582 36.4583L34.957 35.8333C35.1515 35.5278 35.4154 35.3056 35.7487 35.1667C36.082 35.0278 36.4293 35.0139 36.7904 35.125L37.9987 35.5C38.3043 35.2778 38.6031 35.0906 38.8954 34.9383C39.1876 34.7861 39.4998 34.64 39.832 34.5L40.082 33.2917C40.1654 32.9028 40.3526 32.5906 40.6437 32.355C40.9348 32.1194 41.2754 32.0011 41.6654 32H42.332C42.7209 32 43.0615 32.125 43.3537 32.375C43.6459 32.625 43.8331 32.9444 43.9154 33.3333L44.1654 34.5C44.4987 34.6389 44.8109 34.7844 45.102 34.9367C45.3931 35.0889 45.692 35.2767 45.9987 35.5L47.207 35.125C47.5681 35.0139 47.9226 35.0278 48.2704 35.1667C48.6181 35.3056 48.8887 35.5278 49.082 35.8333L49.4154 36.4167C49.6098 36.75 49.6793 37.1111 49.6237 37.5C49.5681 37.8889 49.3876 38.2083 49.082 38.4583L48.1654 39.25C48.2209 39.5833 48.2487 39.9444 48.2487 40.3333C48.2487 40.7222 48.2209 41.0833 48.1654 41.4167L49.082 42.2083C49.3876 42.4583 49.5681 42.7711 49.6237 43.1467C49.6793 43.5222 49.6098 43.8761 49.4154 44.2083L49.0404 44.8333C48.8459 45.1389 48.582 45.3611 48.2487 45.5C47.9154 45.6389 47.5681 45.6528 47.207 45.5417L45.9987 45.1667C45.6931 45.3889 45.3948 45.5761 45.1037 45.7283C44.8126 45.8806 44.4998 46.0267 44.1654 46.1667L43.9154 47.375C43.832 47.7639 43.6448 48.0767 43.3537 48.3133C43.0626 48.55 42.722 48.6678 42.332 48.6667H41.6654ZM18.6654 42V22V29.1667V28.6667V42ZM18.6654 45.3333C17.7487 45.3333 16.9643 45.0072 16.312 44.355C15.6598 43.7028 15.3331 42.9178 15.332 42V22C15.332 21.0833 15.6587 20.2989 16.312 19.6467C16.9654 18.9944 17.7498 18.6678 18.6654 18.6667H27.2904C27.7348 18.6667 28.1587 18.75 28.562 18.9167C28.9654 19.0833 29.3193 19.3194 29.6237 19.625L31.9987 22H45.332C46.2487 22 47.0337 22.3267 47.687 22.98C48.3404 23.6333 48.6665 24.4178 48.6654 25.3333V28.6667C48.6654 29.1389 48.5054 29.535 48.1854 29.855C47.8654 30.175 47.4698 30.3344 46.9987 30.3333C46.5276 30.3322 46.132 30.1722 45.812 29.8533C45.492 29.5344 45.332 29.1389 45.332 28.6667V25.3333H30.6237L27.2904 22H18.6654V42H30.332C30.8043 42 31.2004 42.16 31.5204 42.48C31.8404 42.8 31.9998 43.1956 31.9987 43.6667C31.9976 44.1378 31.8376 44.5339 31.5187 44.855C31.1998 45.1761 30.8043 45.3356 30.332 45.3333H18.6654Z" fill="#686360"/>
</svg>
    ),
  },
];

const investmentLevels = [
  { title: 'Silver', image: com2Investor, alt: 'Silver investment tier' },
  { title: 'Gold', image: com3Investor, alt: 'Gold investment tier' },
  { title: 'Platinum', image: com4Investor, alt: 'Platinum investment tier' },
];

const lineUrl = 'https://lin.ee/Y7kgDFM';

const journeySteps = [
  { step: '1', title: 'Browse', desc: 'แอดไลน์ และ เลือกดูรายการทรัพย์สินที่มีผู้ต้องการขอสินเชื่อ', href: lineUrl },
  { step: '2', title: 'Fund', desc: 'เลือกรายการที่สนใจและทำการโอนเงินผ่านระบบตัวกลางที่ปลอดภัย' },
  { step: '3', title: 'Earn', desc: 'รับผลตอบแทนตามระยะเวลาที่กำหนดในสัญญา' },
  { step: '4', title: 'Settle', desc: 'เลือกรับเงินคืน หรือรับทรัพย์สินเมื่อสิ้นสุดสัญญา' },
];

export default function InvestorPage() {
  return (
    <div className={`${notoSansThai.className} bg-[var(--bg)] text-[var(--ink)]`}>
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-32 right-[-10%] h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle_at_center,rgba(107,186,173,0.28),rgba(245,244,242,0))]" />
        <div className="pointer-events-none absolute top-[28%] left-[-8%] h-[240px] w-[240px] rounded-full bg-[radial-gradient(circle_at_center,rgba(126,198,178,0.2),rgba(245,244,242,0))]" />
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
            <button className="rounded-full bg-[var(--muted-2)] px-4 py-1.5 text-white transition-all duration-300 hover:scale-105 hover:shadow-md">
              นักลงทุน
            </button>
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
          <div className="relative lg:hidden">
            <input id="mobile-menu-investor" type="checkbox" className="peer sr-only" />
            <label
              htmlFor="mobile-menu-investor"
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
              htmlFor="mobile-menu-investor"
              className="fixed inset-0 z-40 bg-black/40 opacity-0 backdrop-blur-sm transition-opacity duration-300 peer-checked:opacity-100 peer-checked:pointer-events-auto pointer-events-none"
              aria-hidden="true"
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center opacity-0 transition-all duration-300 peer-checked:opacity-100 peer-checked:pointer-events-auto pointer-events-none">
              <div className="w-[min(92vw,360px)] rounded-[28px] bg-[#f5f4f2] p-6 shadow-[0_20px_50px_rgba(44,42,40,0.2)] translate-y-4 scale-95 transition-all duration-300 peer-checked:translate-y-0 peer-checked:scale-100">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-[#686360]">เมนู</p>
                  <label
                    htmlFor="mobile-menu-investor"
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
                  <div className="rounded-2xl bg-[#686360] px-4 py-3 text-sm text-white">
                    นักลงทุน
                  </div>
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

        <section className="mx-auto grid w-full max-w-[1216px] items-start gap-10 px-4 pb-16 pt-4 sm:gap-12 sm:px-6 sm:pb-20 sm:pt-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:px-14 lg:pb-24">
          <div className="fade-up reveal-left text-center sm:text-left lg:pt-6">
            <h1 className="max-w-[520px] text-[34px] font-light leading-[1.4] text-[#686360] sm:text-5xl lg:text-[48px]">
              ลงทุนอย่างมั่นใจ...
              <br />มีทรัพย์สินค้ำประกันทุกรายการ
            </h1>
            <p className="mt-4 max-w-[520px] text-sm leading-6 text-[#9a9694] mx-auto sm:mx-0 sm:text-[18px] sm:leading-7">
              สร้างพอร์ตการลงทุนที่มั่นคง (Passive Income)
              <br className="hidden sm:block" />
              ผ่านการปล่อยเงินกู้ที่คัดสรรคุณภาพสูง พร้อมอัปเดตสถานะด้วย AI
            </p>
            <div className="mt-5 flex flex-wrap justify-center sm:justify-start">
              <a
                href={lineUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-sheen rounded-full border border-[var(--accent)] px-6 py-2 text-sm text-[var(--accent)] shadow-[0_8px_18px_rgba(197,81,37,0.25)] transition-colors duration-300 hover:bg-[var(--accent)] hover:text-white sm:px-9 sm:py-4 sm:text-[16px]"
              >
                เริ่มเลย!
              </a>
            </div>
          </div>
          <div className="fade-up reveal-right flex flex-col items-center gap-2 sm:items-end sm:gap-3" style={{ transitionDelay: '0.2s' }}>
            <Image
              src={com1Investor}
              alt="Investor app preview"
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
                  <div key={item.en} className="hover-card flex flex-row flex-wrap items-center gap-3 rounded-[14px] bg-[#cfcac7] px-4 py-2.5 sm:flex-nowrap">
                    <div className="flex-none">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="8" cy="8" r="8" fill="#686360"/>
                        <path d="M4.5 8L6.5 10L11.5 5" stroke="#D0CFCE" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <div className="text-[11px] text-[#686360] sm:text-xs" style={{ fontFamily: 'Noto Sans Thai' }}>
                      {item.en}
                    </div>
                    <div className="ml-auto flex h-[20px] items-center justify-center rounded-full bg-[#efeeed] px-2.5 sm:h-[22px] sm:px-3">
                      <span className="text-[10px] text-[#686360] sm:text-[11px]" style={{ fontFamily: 'Noto Sans Thai' }}>{item.th}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[#686360] py-12 sm:py-16">
          <div className="mx-auto w-full max-w-[1216px] px-4 text-center text-[#f5f4f2] sm:px-6 lg:px-14">
            <h3 className="text-lg font-medium sm:text-xl lg:text-[32px]">Benefits</h3>
            <p className="mt-1 text-[16px] text-[#c8b8b0]">ผลประโยชน์ของนักลงทุน</p>
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
          <div className="text-center">
            <h3 className="text-lg font-medium text-[#686360] sm:text-xl lg:text-[32px]">Investment levels</h3>
            <p className="mt-1 text-[16px] text-[#9a9694]">ระดับการลงทุน</p>
          </div>

          <div className="fade-up mt-10 grid gap-6 justify-items-center sm:gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {investmentLevels.map((tier) => (
              <div key={tier.title} className="flex flex-col items-center gap-3">
                <Image
                  src={tier.image}
                  alt={tier.alt}
                  className="h-auto w-full max-w-[260px] sm:max-w-[280px] lg:max-w-[300px]"
                />
              </div>
            ))}
          </div>
        </section>

        <div className="mx-auto flex justify-center px-4 sm:px-6">
          <div className="h-px w-full max-w-[320px] bg-[var(--accent)]" />
        </div>

        <section className="mx-auto w-full max-w-[1216px] px-4 py-16 sm:px-6 sm:py-20 lg:px-14">
          <div className="mb-10 text-center">
            <h3 className="text-lg font-medium text-[#686360] sm:text-xl lg:text-[32px]">Investor Journey</h3>
            <p className="mt-1 text-[16px] text-[#9a9694]">ขั้นตอนของนักลงทุน</p>
          </div>

          <div className="fade-up grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {journeySteps.map((item) => {
              const card = (
                <div className="rounded-[20px] bg-[#c8c5c2] px-4 py-6 text-center shadow-[0_14px_26px_rgba(67,63,60,0.12)] transition-transform duration-300 hover:-translate-y-1 sm:px-5 sm:py-8">
                  <div className="text-[40px] font-semibold leading-none text-[#f5f4f2] sm:text-[44px] lg:text-[48px]">{item.step}</div>
                  <h4 className="mt-3 text-base font-semibold text-[#FAFAF9] sm:text-lg lg:text-[22px]">{item.title}</h4>
                  <p className="mt-2 text-xs leading-5 text-[#FAFAF9] sm:text-sm lg:text-[14px]">{item.desc}</p>
                </div>
              );

              if (item.href) {
                return (
                  <a
                    key={item.step}
                    href={item.href}
                    target="_blank"
                    rel="noreferrer"
                    className="block"
                  >
                    {card}
                  </a>
                );
              }

              return (
                <div key={item.step}>
                  {card}
                </div>
              );
            })}
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
