import type { Metadata } from "next";
import { IBM_Plex_Sans, Noto_Serif_TC } from "next/font/google";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-sans" });
const serif = Noto_Serif_TC({ subsets: ["latin"], weight: ["600", "700", "900"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: { default: "福利指南｜台灣政府福利資格初篩", template: "%s｜福利指南" },
  description: "用少量資料初步找出台灣中央與桃園市政府福利，查看資格依據並前往官方申請。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant-TW" className={`${sans.variable} ${serif.variable}`}>
      <body>
        <a className="skip-link" href="#main">跳至主要內容</a>
        <div className="site-frame">
          <SiteHeader />
          <main id="main">{children}</main>
          <footer className="site-footer">
            <div><strong>福利指南</strong><p>資格初篩，不取代主管機關認定。</p></div>
            <div><Link href="/about">資料方法與限制</Link><span>Seed review：2026-07-26</span></div>
          </footer>
        </div>
      </body>
    </html>
  );
}
