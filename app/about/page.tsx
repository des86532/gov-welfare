import Link from "next/link";
import { DataMethodContent } from "@/components/data-method-content";

export const metadata = { title: "資料方法" };

export default function AboutPage() {
  return (
    <div className="page-shell about-page">
      <header className="page-title"><p className="eyebrow">How it works</p><h1>不把政府資料假裝成同一種格式</h1><p>這個 MVP 把「發現資料」、「理解資格」與「正式發布」分開。這是可靠度設計，不只是工程分層。</p></header>
      <DataMethodContent />
      <div className="about-cta"><div><strong>想先看看結果？</strong><p>所有題目都能略過，不知道就保持 unknown。</p></div><Link className="button" href="/find">開始資格初篩 →</Link></div>
    </div>
  );
}
