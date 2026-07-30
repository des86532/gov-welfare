import type { Metadata } from "next";
import { IBM_Plex_Sans, Noto_Serif_TC } from "next/font/google";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-sans" });
const serif = Noto_Serif_TC({ subsets: ["latin"], weight: ["600", "700", "900"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: { default: "福利指南｜台灣政府福利資格初篩", template: "%s｜福利指南" },
  description: "找出台灣中央與地方政府福利、活動及體驗營，查看人工 Review 的資格與官方 Evidence。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant-TW" className={`${sans.variable} ${serif.variable}`} data-scroll-behavior="smooth">
      <body>
        <a className="skip-link" href="#main">跳至主要內容</a>
        <div className="site-frame">
          <SiteHeader />
          <main id="main">{children}</main>
          <footer className="site-footer">
            <div><strong>福利指南</strong><p>資格初篩，不取代主管機關認定。</p></div>
            <div><Link href="/programs">查看全部方案</Link><span>Source monitoring enabled</span></div>
          </footer>
        </div>
      </body>
    </html>
  );
}
