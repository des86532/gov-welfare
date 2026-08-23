export function DataMethodContent() {
  return (
    <>
      <section className="pipeline" aria-label="資料處理流程">
        <div><span>01</span><strong>Source registry</strong><p>每個官方 Source 各自記錄格式、用途、更新頻率與官方入口。</p></div><b aria-hidden="true">→</b>
        <div><span>02</span><strong>Source Adapter</strong><p>保留 Raw snapshot，依 Source-specific mapping 擷取官方內容。</p></div><b aria-hidden="true">→</b>
        <div><span>03</span><strong>Auto sync</strong><p>成功擷取後自動更新公開版本，不建立人工 Review Queue。</p></div><b aria-hidden="true">→</b>
        <div><span>04</span><strong>Official link</strong><p>每筆資料保留主管機關與官方連結，供使用者查證。</p></div>
      </section>
      <div className="about-grid">
        <section><p className="eyebrow">Data boundary</p><h2>原文與 Rules 分開</h2><dl className="definition-list"><div><dt>descriptive_only</dt><dd>顯示官方擷取內容與連結，不做資格結論。</dd></div><div><dt>matchable</dt><dd>已有明確 Structured Rules，可參與初篩。</dd></div><div><dt>archived</dt><dd>官方 API 已移除或方案結束，保留歷史版本。</dd></div></dl><p>爬蟲可以更新官方文字，但不會從長文自行猜測年齡、所得或身分 Rules。</p></section>
        <section><p className="eyebrow">Failure handling</p><h2>抓取失敗不清空網站</h2><p>成功擷取才建立新版；Timeout、404 或格式錯誤時保留上一個公開版本，並在 Admin 顯示 Source 異常。</p></section>
        <section><p className="eyebrow">Privacy boundary</p><h2>公開問卷不進 Server</h2><p>Profile facts 只保留於同一分頁的 <code>sessionStorage</code>，關閉分頁後即消失。系統不建立帳號、不串接 MyData，也沒有 <code>POST /api/match</code>。</p></section>
        <section><p className="eyebrow">Disclaimer</p><h2>初篩不是核定</h2><p>Competitive selection 只顯示符合報名門檻；Loan 只顯示可提出申請；醫療、所得、投保與歷史使用紀錄仍由主管機關查核。</p></section>
      </div>
    </>
  );
}
