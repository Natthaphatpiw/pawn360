import type { Metadata } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import "./globals.css";
import ToastProvider from "@/components/ToastProvider";
import ScrollReveal from "@/components/ScrollReveal";
import CookieBanner from "@/components/CookieBanner";

const notoSansThai = Noto_Sans_Thai({
  variable: "--font-noto-sans-thai",
  subsets: ["thai", "latin"],
  weight: ["200", "300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Astly",
  description: "Astly is a p2p platform for investors and borrowers in Thailand.",
  icons: {
    icon: "/assets/astly_logo_3Dcircle.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="theme-web" style={{ colorScheme: "light", backgroundColor: "var(--background)" }}>
      <body
        className={`${notoSansThai.variable} ${notoSansThai.className} theme-web antialiased`}
      >
        {children}
        <ScrollReveal />
        <CookieBanner />
        <ToastProvider />
      </body>
    </html>
  );
}
