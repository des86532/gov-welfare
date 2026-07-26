export type TaoyuanSourceClassification = {
  title: string;
  classification: "matchable" | "descriptive_only" | "excluded";
  rationale: string;
};

export const taoyuanSourceClassifications: TaoyuanSourceClassification[] = [
  { title: "桃園市身心障礙者取得技術士證照獎勵", classification: "matchable", rationale: "年齡、設籍、身障證明與證照期限可形成 Rules。" },
  { title: "身心障礙者參加公務人員考試補習費用補助", classification: "descriptive_only", rationale: "費用與課程證明仍需人工查核。" },
  { title: "訴訟期間生活補助金", classification: "descriptive_only", rationale: "需依案件狀態與機關認定。" },
  { title: "桃園市特殊境遇家庭扶助", classification: "descriptive_only", rationale: "身分、所得及家庭事實條件複雜。" },
  { title: "經濟弱勢原住民建購住宅補助", classification: "descriptive_only", rationale: "涉及財產、所得與住宅審查。" },
  { title: "經濟弱勢原住民族家庭租屋補助計畫", classification: "descriptive_only", rationale: "原始 Category 有誤，且需所得及租約審查。" },
  { title: "身心障礙者自力更生創業補助申請", classification: "descriptive_only", rationale: "需創業計畫及專業審查。" },
  { title: "經濟弱勢原住民修繕住宅補助", classification: "descriptive_only", rationale: "修繕事實與財產資格需現場／文件審查。" },
  { title: "新住民職業訓練期間子女托育補助", classification: "descriptive_only", rationale: "須與特定職訓參訓紀錄連動。" },
  { title: "桃園市政府智慧長照資訊系統", classification: "excluded", rationale: "這是系統入口，不是福利 Program。" },
  { title: "身心障礙者職業訓練", classification: "descriptive_only", rationale: "課程、開班及評估條件會變動。" },
  { title: "身心障礙者就業相關手語翻譯服務", classification: "descriptive_only", rationale: "服務情境需個案確認。" },
  { title: "訴訟裁判費、律師費及裁決律師費", classification: "descriptive_only", rationale: "案件類型及必要費用由機關審查。" },
  { title: "政策性農業專案貸款利息補助", classification: "descriptive_only", rationale: "Loan 與 Interest subsidy 須授信及災損／政策資格。" },
  { title: "桃園市身心障礙者臨時及短期照顧服務", classification: "descriptive_only", rationale: "服務需求及照顧評估不可只由問卷決定。" },
  { title: "身心障礙者就業及職業重建服務", classification: "descriptive_only", rationale: "需專業職業重建評估。" },
  { title: "消費者便民服務", classification: "excluded", rationale: "一般公共服務，並非資格型福利。" },
  { title: "申請漁業天然災害救助及低利貸款", classification: "descriptive_only", rationale: "須有公告災區與實際災損認定。" },
  { title: "身心障礙者社區居住補助", classification: "descriptive_only", rationale: "涉及服務量與專業評估。" },
  { title: "社區(疑似)精神病患通報轉介", classification: "excluded", rationale: "通報轉介流程，不作為福利推薦。" },
  { title: "申請農業天然災害救助及低利貸款", classification: "descriptive_only", rationale: "須有公告災區、災損認定與授信。" },
  { title: "原住民族法律費用補助", classification: "descriptive_only", rationale: "案件與法律費用須審查。" },
  { title: "原住民公益彩券工作能力證明", classification: "excluded", rationale: "證明申請，不是 Benefit 本身。" },
  { title: "公立幼兒園及非營利幼兒園需要協助幼兒優先入園", classification: "descriptive_only", rationale: "依學年度、名額與招生簡章辦理。" },
  { title: "公立幼兒園及非營利幼兒園課後留園弱勢(幼兒)補助", classification: "descriptive_only", rationale: "依學期、園所與弱勢證明審查。" },
  { title: "農田受災救助", classification: "descriptive_only", rationale: "須有災害公告及現地勘查。" },
];
