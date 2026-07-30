export function DataMethodContent() {
  return (
    <>
      <section className="pipeline" aria-label="資料處理流程">
        <div><span>01</span><strong>Source registry</strong><p>每個官方 Source 各自記錄格式、用途、更新頻率與 freshness。</p></div><b aria-hidden="true">→</b>
        <div><span>02</span><strong>Adapter</strong><p>JSON、CSV、HTML、PDF 只抽出 Draft 與原文快照，不直接生 Rules。</p></div><b aria-hidden="true">→</b>
        <div><span>03</span><strong>Human Review</strong><p>Reviewer 對照 Authority、日期與文件性質，留下 Rationale。</p></div><b aria-hidden="true">→</b>
        <div><span>04</span><strong>Published version</strong><p>只有已驗證 Atomic rules 才能顯示「基本條件符合」。</p></div>
      </section>
      <div className="about-grid">
        <section><p className="eyebrow">Coverage levels</p><h2>允許不同完整度共存</h2><dl className="definition-list"><div><dt>catalog_only</dt><dd>只知道 Source 存在，不公開。</dd></div><div><dt>descriptive_only</dt><dd>可搜尋與閱讀，但不做資格結論。</dd></div><div><dt>matchable</dt><dd>Rules 已人工驗證，可參與初篩。</dd></div><div><dt>needs_review</dt><dd>內容異動或衝突，暫停判定符合。</dd></div><div><dt>archived</dt><dd>停辦或年度結束，保留歷史。</dd></div></dl></section>
        <section><p className="eyebrow">Privacy boundary</p><h2>公開問卷不進 Server</h2><p>Profile facts 只保留於同一分頁的 <code>sessionStorage</code>，用於從 Detail page 返回時恢復結果；關閉分頁後即消失。系統不建立帳號、不串接 MyData，也沒有 <code>POST /api/match</code>。</p><p>公開 API 只提供已發布的 Program 內容；Raw snapshots、Review 與來源錯誤不對外開放。</p></section>
        <section><p className="eyebrow">Current scope</p><h2>明確承諾 Coverage</h2><p>公開 Catalog 目前收錄中央 Seed programs，以及桃園、新北、臺北與臺中完成 Review 的 Pilot Programs。地方 Source items 必須先完成分類，再由 Authority page 與當年度文件補足 Evidence。</p><p>Open Data 只用於 Discovery 或 Draft；舊年度門檻、統計資料、核定名單與服務據點不得直接產生資格結論。</p></section>
        <section><p className="eyebrow">Disclaimer</p><h2>初篩不是核定</h2><p>Competitive selection 只會顯示符合報名門檻；Loan 只會顯示可提出申請；醫療、所得、投保與歷史使用紀錄仍由主管機關查核。</p></section>
      </div>
    </>
  );
}
