import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="福利指南首頁">
        <span className="brand-mark" aria-hidden="true">福</span>
        <span>
          <strong>福利指南</strong>
          <small>Taiwan Welfare Navigator</small>
        </span>
      </Link>
      <nav aria-label="主要導覽">
        <Link href="/find">資格初篩</Link>
        <Link href="/programs">全部方案</Link>
        <Link href="/about">資料方法</Link>
      </nav>
    </header>
  );
}
