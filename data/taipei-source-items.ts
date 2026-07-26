export type TaipeiSourceClassification = {
  title: string;
  classification: "matchable" | "descriptive_only" | "excluded";
  rationale: string;
};

export const taipeiSourceClassifications: TaipeiSourceClassification[] = [
  { title: "低收入戶生活扶助", classification: "matchable", rationale: "115 年 Authority page 與年度公告已列出設籍、居住、所得、動產及不動產門檻。" },
  { title: "低收入戶18歲以上就學生活補助", classification: "matchable", rationale: "現行 Authority page 明列低收入戶、18 至未滿 25 歲、學籍與排除條件。" },
  { title: "低收入戶國中以上就學子女交通補助", classification: "matchable", rationale: "115 年 FAQ 與現行作業須知明列年齡、學籍、金額及自動撥付方式。" },
  { title: "中低收入戶", classification: "matchable", rationale: "台北服務通現行申辦頁可建立申請人年齡、戶籍與財稅查核基本門檻。" },
  { title: "身心障礙者生活補助", classification: "matchable", rationale: "115 年 Authority page 明列設籍、實際居住、183 日、身障證明、財稅與公費安置條件。" },
  { title: "中低收入老人生活津貼", classification: "matchable", rationale: "115 年 Authority page 明列 65 歲、設籍、實際居住、183 日、財稅與排除條件。" },
  { title: "營養品補助", classification: "matchable", rationale: "現行 Authority page 明列低／中低收入戶、三類對象、醫師評估與補助頻率。" },
  { title: "生育補助", classification: "matchable", rationale: "現行 Authority page 明列低／中低收入戶、分娩或 12 週以上流死產、60 日期限與不得重複申領。" },
  { title: "市民醫療補助", classification: "matchable", rationale: "115 年 Authority page 明列臺北市民、醫療費門檻、補助比例、上限與財稅查核方式。" },
  { title: "急難救助", classification: "matchable", rationale: "115 年 Authority page 明列六類急難事由、三個月期限、補助上限與非設籍者例外。" },
];
