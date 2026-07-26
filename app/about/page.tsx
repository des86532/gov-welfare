import Link from "next/link";

export const metadata = { title: "資料方法" };

export default function AboutPage() {
  return (
    <div className="page-shell about-page">
      <header className="page-title"><p className="eyebrow">How it works</p><h1>不把政府資料假裝成同一種格式</h1><p>這個 MVP 把「發現資料」、「理解資格」與「正式發布」分開。這是可靠度設計，不只是工程分層。</p></header>
      <section className="pipeline" aria-label="資料處理流程">
        <div><span>01</span><strong>Source registry</strong><p>每個官方 Source 各自記錄格式、用途、更新頻率與 freshness。</p></div><b aria-hidden="true">→</b>
        <div><span>02</span><strong>Adapter</strong><p>JSON、HTML、PDF 只抽出 Draft 與原文快照，不直接生 Rules。</p></div><b aria-hidden="true">→</b>
        <div><span>03</span><strong>Human Review</strong><p>Reviewer 對照 Authority、日期與文件性質，留下 Rationale。</p></div><b aria-hidden="true">→</b>
        <div><span>04</span><strong>Published version</strong><p>只有已驗證 Atomic rules 才能顯示「基本條件符合」。</p></div>
      </section>
      <div className="about-grid">
        <section><p className="eyebrow">Coverage levels</p><h2>允許不同完整度共存</h2><dl className="definition-list"><div><dt>catalog_only</dt><dd>只知道 Source 存在，不公開。</dd></div><div><dt>descriptive_only</dt><dd>可搜尋與閱讀，但不做資格結論。</dd></div><div><dt>matchable</dt><dd>Rules 已人工驗證，可參與初篩。</dd></div><div><dt>needs_review</dt><dd>內容異動或衝突，暫停判定符合。</dd></div><div><dt>archived</dt><dd>停辦或年度結束，保留歷史。</dd></div></dl></section>
        <section><p className="eyebrow">Privacy boundary</p><h2>公開問卷不進 Server</h2><p>Profile facts 只保留於目前頁面的 Browser memory。系統不建立帳號、不串接 MyData，也沒有 <code>POST /api/match</code>。</p><p>公開 API 只提供已發布的 Program 內容；Raw snapshots、Review 與來源錯誤不對外開放。</p></section>
        <section><p className="eyebrow">Current scope</p><h2>明確承諾 Coverage</h2><p>目前收錄中央 Seed programs 與桃園市 Pilot。桃園 Open Data 的 26 筆項目皆有分類，但只有完成 Rules 與 Authority link Review 的方案能進入比對。</p><p>下一階段才會用新北市不透明欄位做 Adapter 壓力測試。</p></section>
        <section><p className="eyebrow">Disclaimer</p><h2>初篩不是核定</h2><p>Competitive selection 只會顯示符合報名門檻；Loan 只會顯示可提出申請；醫療、所得、投保與歷史使用紀錄仍由主管機關查核。</p></section>
      </div>
      <div className="about-cta"><div><strong>想先看看結果？</strong><p>所有題目都能略過，不知道就保持 unknown。</p></div><Link className="button" href="/find">開始資格初篩 →</Link></div>
    </div>
  );
}
