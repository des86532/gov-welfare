export type TaichungSourceClassification = {
  title: string;
  classification: "matchable" | "descriptive_only" | "excluded";
  rationale: string;
};

export const taichungSourceClassifications: TaichungSourceClassification[] = [
  { title: "市急難救助", classification: "matchable", rationale: "現行社會局頁面明列臺中設籍、六類急難事由、三個月期限與救助上限。" },
  { title: "行旅人返鄉車資補助(川資)", classification: "matchable", rationale: "現行社會局頁面明列外縣市民眾短缺川資、返籍用途、一次一張換票證及排除情形。" },
  { title: "急難紓困實施方案", classification: "matchable", rationale: "現行社會局頁面明列七類家庭急難事由、訪視與財稅審核、救助金範圍及現居地受理方式。" },
  { title: "安遷救助", classification: "matchable", rationale: "現行社會局頁面明列災前設籍實住、住屋不堪居住、三個月期限與每人／每案上限。" },
  { title: "重傷救助", classification: "matchable", rationale: "現行社會局頁面明列因災重傷或緊急住院自付額條件、三個月期限與定額救助。" },
  { title: "死亡救助", classification: "matchable", rationale: "現行社會局頁面明列臺中境內因災死亡或三十日內死亡、三個月申請期限及定額救助。" },
  { title: "失蹤救助", classification: "matchable", rationale: "現行社會局頁面明列因災失蹤、失蹤證明、三個月期限及定額救助。" },
  { title: "住屋土石流救助", classification: "matchable", rationale: "現行社會局頁面明列實際居住、土石流高度或面積門檻、三個月期限及每戶金額。" },
  { title: "住屋淹水救助", classification: "matchable", rationale: "現行社會局頁面明列實際居住、淹水五十公分門檻、三個月期限及每戶金額。" },
  { title: "食物銀行", classification: "matchable", rationale: "現行告知單明列實際居住臺中、三類生活陷困途徑、六個月一期與社工審核。" },
];
