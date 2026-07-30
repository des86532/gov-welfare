export const OPPORTUNITY_CATEGORIES = ["青年培力", "體驗營", "研習營", "工作假期"] as const;
export type OpportunityCategory = typeof OPPORTUNITY_CATEGORIES[number];

export const OPPORTUNITY_AUDIENCES = ["一般民眾", "18 歲以上", "高中職學生", "大專校院學生", "女性青年", "國中小教師"] as const;
export type OpportunityAudience = typeof OPPORTUNITY_AUDIENCES[number];

export type OpportunityEvidence = {
  field: string;
  sourceId: string;
  sourceUrl: string;
  locator: string;
  extractedValue: string;
};

export type CuratedOpportunity = {
  slug: string;
  sourceId: string;
  externalId: string;
  title: string;
  summary: string;
  category: OpportunityCategory;
  organizer: string;
  organizerType: "government" | "foundation" | "nonprofit";
  governmentSupportStatus: "official" | "claimed_pending_evidence" | "not_applicable";
  supportSummary: string;
  selectionType: "first_come_review" | "competitive_selection" | "capacity_review";
  audiences: OpportunityAudience[];
  regions: string[];
  locationSummary: string;
  eligibilitySummary: string;
  feeSummary: string;
  capacitySummary?: string;
  applicationOpen?: string;
  applicationClose?: string;
  applicationDateLabel: string;
  eventStart?: string;
  eventEnd?: string;
  eventDateLabel: string;
  officialUrl: string;
  applicationUrl?: string;
  verifiedAt: string;
  caveats: string[];
  evidence: OpportunityEvidence[];
};

const verifiedAt = "2026-07-30";

export const reviewedOpportunities: CuratedOpportunity[] = [
  {
    slug: "yda-women-leadership-camp-115",
    sourceId: "yda-activity-listing",
    externalId: "https://www.yda.gov.tw/eventDoc.aspx?uid=102&pid=56&eid=116",
    title: "115 年大專女學生領導力培訓營",
    summary: "教育部青年發展署辦理的三天女性青年培力活動，分北、中、南三場，需先完成報名並等待正備取通知。",
    category: "青年培力",
    organizer: "教育部青年發展署",
    organizerType: "government",
    governmentSupportStatus: "official",
    supportSummary: "中央政府主辦之青年培力活動",
    selectionType: "competitive_selection",
    audiences: ["大專校院學生", "女性青年"],
    regions: ["臺北市", "臺中市", "嘉義縣", "高雄市"],
    locationSummary: "北區臺北、中區臺中；南區為嘉義或高雄，實際地點依主辦單位確認",
    eligibilitySummary: "30 歲以下之大專校院、五專四年級以上、二專、技術學院、軍警校院、大學或研究所在學女學生。",
    feeSummary: "官方活動頁未載明費用，應以錄取通知為準",
    applicationClose: "2026-05-21T23:59:59+08:00",
    applicationDateLabel: "已於 2026 年 5 月 21 日 23:59 截止",
    eventStart: "2026-07-28T00:00:00+08:00",
    eventEnd: "2026-08-28T23:59:59+08:00",
    eventDateLabel: "南區 7/28–7/30、中區 8/11–8/13、北區 8/26–8/28",
    officialUrl: "https://www.yda.gov.tw/eventDoc.aspx?uid=102&pid=56&eid=116",
    verifiedAt,
    caveats: ["符合基本條件不代表錄取，仍需等待主辦單位公布正備取名單。", "南區實際辦理地點以主辦單位最終通知為準。"],
    evidence: [
      { field: "audiences", sourceId: "yda-activity-listing", sourceUrl: "https://www.yda.gov.tw/eventDoc.aspx?uid=102&pid=56&eid=116", locator: "活動頁／一、參與對象", extractedValue: "30 歲以下之大專校院在學女學生" },
      { field: "eventDate", sourceId: "yda-activity-listing", sourceUrl: "https://www.yda.gov.tw/eventDoc.aspx?uid=102&pid=56&eid=116", locator: "活動頁／二、活動時間及地點", extractedValue: "南、中、北三場次，2026-07-28 至 2026-08-28" },
      { field: "applicationWindow", sourceId: "yda-activity-listing", sourceUrl: "https://www.yda.gov.tw/eventDoc.aspx?uid=102&pid=56&eid=116", locator: "活動頁／四、報名期程", extractedValue: "5 月 21 日 23:59 前報名截止" },
    ],
  },
  {
    slug: "miaoli-oil-well-trail-2026",
    sourceId: "tmitrail-work-holiday-listing",
    externalId: "https://www.tmitrail.org.tw/civicrm/event/info?reset=1&id=408",
    title: "苗栗古油井步道手作活動",
    summary: "在苗栗出磺坑參與古油井步道走讀與低衝擊維護實作，主辦頁載明其餘費用由客家委員會計畫支應。",
    category: "工作假期",
    organizer: "台灣樟之細路協會、台灣千里步道協會",
    organizerType: "nonprofit",
    governmentSupportStatus: "claimed_pending_evidence",
    supportSummary: "主辦頁聲稱其餘費用由客家委員會計畫支應，尚缺政府端 Evidence",
    selectionType: "capacity_review",
    audiences: ["一般民眾", "18 歲以上"],
    regions: ["苗栗縣"],
    locationSummary: "苗栗縣公館鄉出磺坑古油井步道；苗栗高鐵站集合",
    eligibilitySummary: "年滿 18 歲，對步道工作與環境守護有熱情，並能負荷高勞力戶外活動。",
    feeSummary: "NT$500，含交通接駁；主辦頁稱其餘由客家委員會計畫支應",
    capacitySummary: "招募 20 名，報名後仍需等待審核與錄取通知",
    applicationOpen: "2026-07-24T00:00:00+08:00",
    applicationClose: "2026-08-20T23:59:59+08:00",
    applicationDateLabel: "2026 年 7 月 24 日至 8 月 20 日 23:59",
    eventStart: "2026-08-30T08:00:00+08:00",
    eventEnd: "2026-08-30T17:30:00+08:00",
    eventDateLabel: "2026 年 8 月 30 日 08:00–17:30",
    officialUrl: "https://www.tmitrail.org.tw/civicrm/event/info?reset=1&id=408",
    applicationUrl: "https://www.tmitrail.org.tw/civicrm/event/info?reset=1&id=408",
    verifiedAt,
    caveats: ["這是非營利組織主辦活動，不等同政府直接提供的福利。", "政府計畫支應目前只有主辦頁說明，未找到客家委員會端可交叉驗證的公告。"],
    evidence: [
      { field: "applicationWindow", sourceId: "tmitrail-work-holiday-listing", sourceUrl: "https://www.tmitrail.org.tw/civicrm/event/info?reset=1&id=408", locator: "活動頁／報名日期", extractedValue: "2026-07-24 至 2026-08-20 23:59" },
      { field: "eligibility", sourceId: "tmitrail-work-holiday-listing", sourceUrl: "https://www.tmitrail.org.tw/civicrm/event/info?reset=1&id=408", locator: "活動頁／活動資訊／活動對象", extractedValue: "年滿 18 歲，招募 20 名" },
      { field: "fee", sourceId: "tmitrail-work-holiday-listing", sourceUrl: "https://www.tmitrail.org.tw/civicrm/event/info?reset=1&id=408", locator: "活動頁／活動資訊／活動費用", extractedValue: "500 元，含交通接駁，其餘由客家委員會計畫支應" },
    ],
  },
  {
    slug: "cga-marine-student-camp-115",
    sourceId: "cga-marine-student-camp-115",
    externalId: "cga-marine-student-camp-115",
    title: "115 年海洋學生體驗營",
    summary: "海巡署北部分署辦理的兩天一夜海洋與海巡體驗，包含彭佳嶼、海洋環境教育與親海活動。",
    category: "體驗營",
    organizer: "海洋委員會海巡署北部分署",
    organizerType: "government",
    governmentSupportStatus: "official",
    supportSummary: "講師、專業場域與團體服等由海洋委員會支應",
    selectionType: "first_come_review",
    audiences: ["高中職學生", "大專校院學生"],
    regions: ["臺北市", "新北市", "基隆市"],
    locationSummary: "臺北車站集合，前往彭佳嶼及東北角地區",
    eligibilitySummary: "高中職以上在校學生，且須符合活動所列健康與戶外活動條件。",
    feeSummary: "每人概估 NT$1,095；錄取人數少於 11 人時可能補繳，活動後按實際支出退費",
    capacitySummary: "11 名，依線上報名序號及資格審查順序錄取",
    applicationOpen: "2026-05-01T00:00:00+08:00",
    applicationClose: "2026-05-31T17:00:00+08:00",
    applicationDateLabel: "已於 2026 年 5 月 31 日 17:00 截止",
    eventStart: "2026-07-07T00:00:00+08:00",
    eventEnd: "2026-07-08T23:59:59+08:00",
    eventDateLabel: "2026 年 7 月 7–8 日，2 天 1 夜",
    officialUrl: "https://www.cga.gov.tw/GipOpen/wSite/ct?ctNode=13476&mp=999&xItem=167400",
    verifiedAt,
    caveats: ["官方簡章列有不適宜參加激烈活動之健康條件，實際資格由承辦機關審查。", "費用為 11 人平均分攤之概估值，可能依實際錄取人數調整。"],
    evidence: [
      { field: "eligibility", sourceId: "cga-marine-student-camp-115", sourceUrl: "https://www.cga.gov.tw/GipOpen/wSite/public/Attachment/f1777254973374.pdf", locator: "報名簡章 p.1／柒、參加資格", extractedValue: "高中（職）以上在校學生" },
      { field: "applicationWindow", sourceId: "cga-marine-student-camp-115", sourceUrl: "https://www.cga.gov.tw/GipOpen/wSite/public/Attachment/f1777254973374.pdf", locator: "報名簡章 p.2／捌、報名流程", extractedValue: "2026-05-01 至 2026-05-31 17:00" },
      { field: "fee", sourceId: "cga-marine-student-camp-115", sourceUrl: "https://www.cga.gov.tw/GipOpen/wSite/public/Attachment/f1777254973374.pdf", locator: "報名簡章 p.4／壹拾、活動費用及繳費方式", extractedValue: "每人概估 1,095 元，部分項目由海洋委員會支應" },
    ],
  },
  {
    slug: "mnd-nansha-study-camp-115",
    sourceId: "mnd-nansha-study-camp-115",
    externalId: "mnd-nansha-study-camp-115",
    title: "115 年全民國防教育南沙研習營",
    summary: "由學校組隊報名、搭乘軍艦前往太平島的九日研習活動；符合基本條件後仍由學校與國防部審查遴選。",
    category: "研習營",
    organizer: "國防部政治作戰局",
    organizerType: "government",
    governmentSupportStatus: "official",
    supportSummary: "政府主辦之九日研習，參加者負擔膳食、洗滌與保險費",
    selectionType: "competitive_selection",
    audiences: ["大專校院學生", "國中小教師"],
    regions: ["高雄市"],
    locationSummary: "由高雄左營軍港出發前往太平島",
    eligibilitySummary: "中華民國國籍之全民國防教育教師，或國內大專院校博、碩士、大三、大四且未逾 40 歲之在學學生；學生需由學校組隊。",
    feeSummary: "每人 NT$2,188，包含膳食、洗滌及保險",
    capacitySummary: "大專院校每校以 1 隊為限，每隊 1 名教師及 6 名學生；仍有梯次與性別名額配置",
    applicationClose: "2026-03-16T23:59:59+08:00",
    applicationDateLabel: "已於 2026 年 3 月 16 日截止，以郵戳為憑",
    eventDateLabel: "2026 年 4 至 8 月間共 3 梯次，每梯次 9 日；實際梯次另行通知",
    officialUrl: "https://aode.mnd.gov.tw/Unit/Content/1839?unitId=102",
    verifiedAt,
    caveats: ["學生不能個別報名，需由大專院校組隊並完成校內遴選。", "活動受任務、天候及海象影響，可能延期或取消。"],
    evidence: [
      { field: "eligibility", sourceId: "mnd-nansha-study-camp-115", sourceUrl: "https://aode.mnd.gov.tw/DownloadHandler.ashx?unitId=102&contentId=1839&uploadId=12885", locator: "報名簡章 p.1／貳、參加對象", extractedValue: "中華民國國籍教師；或未逾 40 歲之大專院校博碩士、大三、大四學生" },
      { field: "applicationWindow", sourceId: "mnd-nansha-study-camp-115", sourceUrl: "https://aode.mnd.gov.tw/DownloadHandler.ashx?unitId=102&contentId=1839&uploadId=12885", locator: "報名簡章 p.2–3／伍、報名及資格審查", extractedValue: "2026-03-16 截止，以寄件當日郵戳為憑" },
      { field: "fee", sourceId: "mnd-nansha-study-camp-115", sourceUrl: "https://aode.mnd.gov.tw/DownloadHandler.ashx?unitId=102&contentId=1839&uploadId=12885", locator: "報名簡章 p.3／柒、活動費用及繳納方式", extractedValue: "每人合計 2,188 元" },
    ],
  },
  {
    slug: "cadf-summer-air-camp-2026",
    sourceId: "cadf-summer-air-camp-2026",
    externalId: "cadf-summer-air-camp-2026",
    title: "我的青航時代 2026 暑期航空營",
    summary: "以機師空服、簽派管制、地勤修護三組分流的航空職涯體驗，包含模擬器、實務課程與場域參訪。",
    category: "體驗營",
    organizer: "財團法人中華航空事業發展基金會",
    organizerType: "foundation",
    governmentSupportStatus: "not_applicable",
    supportSummary: "Foundation 主辦之青年培育活動；官方頁未將其列為政府補助",
    selectionType: "competitive_selection",
    audiences: ["大專校院學生", "18 歲以上"],
    regions: ["桃園市"],
    locationSummary: "課程含北部飛航服務園區、航空公司及桃園航空場域參訪；詳細集合地點依錄取通知",
    eligibilitySummary: "年滿 18 歲以上之在學學生。",
    feeSummary: "官方活動頁未載明費用，應以招生網站及錄取通知為準",
    capacitySummary: "三組各 30 名，共 90 名",
    applicationClose: "2026-06-08T17:00:00+08:00",
    applicationDateLabel: "已於 2026 年 6 月 8 日 17:00 截止",
    eventDateLabel: "2026 暑期，實際梯次依錄取通知",
    officialUrl: "https://www.cadf.org.tw/blog/701",
    verifiedAt,
    caveats: ["這是 Foundation 主辦活動，不應自動標示為政府免費營隊或政府補助。", "官方消息頁未載明費用與完整梯次日期。"],
    evidence: [
      { field: "eligibility", sourceId: "cadf-summer-air-camp-2026", sourceUrl: "https://www.cadf.org.tw/blog/701", locator: "報名資訊／參與資格", extractedValue: "年滿 18 歲以上在學學生" },
      { field: "capacity", sourceId: "cadf-summer-air-camp-2026", sourceUrl: "https://www.cadf.org.tw/blog/701", locator: "報名資訊／招生名額", extractedValue: "三組共 90 名，每組 30 名" },
      { field: "applicationWindow", sourceId: "cadf-summer-air-camp-2026", sourceUrl: "https://www.cadf.org.tw/blog/701", locator: "報名資訊／報名期間", extractedValue: "至 2026-06-08 17:00" },
    ],
  },
  {
    slug: "spnp-youth-camp-18",
    sourceId: "spnp-activity-calendar-json",
    externalId: "4239",
    title: "雪霸國家公園第 18 屆 Youth Camp",
    summary: "高中及大專青年三天進入武陵或觀霧園區，參與登山、生態調查、環境教育與自然觀察。",
    category: "體驗營",
    organizer: "內政部國家公園署雪霸國家公園管理處",
    organizerType: "government",
    governmentSupportStatus: "official",
    supportSummary: "政府主辦；每梯次保留 4 名清寒學生及轄區原住民名額，可檢附證明減收部分費用",
    selectionType: "capacity_review",
    audiences: ["高中職學生", "大專校院學生"],
    regions: ["臺中市", "苗栗縣"],
    locationSummary: "武陵園區及觀霧園區，共兩梯次",
    eligibilitySummary: "全國高中及大專院校學生；清寒學生及轄區原住民另有保留名額與部分費用減收。",
    feeSummary: "一般費用未載於活動 JSON；符合清寒或轄區原住民條件者可減收部分費用",
    capacitySummary: "名額有限；每梯次另保留 4 名清寒學生及轄區原住民名額",
    applicationOpen: "2026-05-05T09:00:00+08:00",
    applicationDateLabel: "2026 年 5 月 5 日 09:00 起開放；官方 JSON 未載截止日",
    eventStart: "2026-07-14T00:00:00+08:00",
    eventEnd: "2026-08-06T23:59:59+08:00",
    eventDateLabel: "武陵 7/14–7/16、觀霧 8/4–8/6",
    officialUrl: "https://www.spnp.gov.tw/ch/titlelist/events-calendar/4239",
    applicationUrl: "https://portal.spnp.gov.tw/registration/",
    verifiedAt,
    caveats: ["官方 JSON 只載明開放時間，未載一般名額、完整費用與報名截止日。", "進階資格與減免仍由雪霸處依證明文件審查。"],
    evidence: [
      { field: "audiences", sourceId: "spnp-activity-calendar-json", sourceUrl: "https://www.spnp.gov.tw/sites/www.spnp.gov.tw/ch/main/events-calendar/list.json", locator: "JSON row id=4239／content", extractedValue: "全國高中及大專院校學生" },
      { field: "eventDate", sourceId: "spnp-activity-calendar-json", sourceUrl: "https://www.spnp.gov.tw/sites/www.spnp.gov.tw/ch/main/events-calendar/list.json", locator: "JSON row id=4239／content、event_start、event_end", extractedValue: "2026-07-14 至 07-16；2026-08-04 至 08-06" },
      { field: "feeReduction", sourceId: "spnp-activity-calendar-json", sourceUrl: "https://www.spnp.gov.tw/sites/www.spnp.gov.tw/ch/main/events-calendar/list.json", locator: "JSON row id=4239／content", extractedValue: "每梯次 4 名清寒學員及轄區原住民，檢附證明得減收部分費用" },
    ],
  },
];

export const reviewedOpportunityBySlug = new Map(reviewedOpportunities.map((item) => [item.slug, item]));
