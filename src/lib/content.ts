import { Locale } from "@/types/domain";

export function getMarketingContent(locale: Locale) {
  if (locale === "en") {
    return {
      hero: {
        eyebrow: "Free quote arrangement for Hong Kong home repairs",
        title: "Arrange free repair quotes, then compare before you confirm.",
        description:
          "Post the address and repair details once. Hotfix helps arrange structured quotes so you can compare price, timing, and scope before booking.",
      },
      valuePoints: [
        "Free quote arrangement before you decide",
        "Quotes split by labour, parts, call-out fee, and availability",
        "Compare multiple pros without calling one by one",
      ],
      steps: [
        {
          title: "Tell us what needs fixing",
          body: "Choose a trade, describe the issue, and add a structured Hong Kong address.",
        },
        {
          title: "Pros review open leads",
          body: "Tradespeople can browse open requests and use category filters before deciding whether to quote.",
        },
        {
          title: "Compare quotes before committing",
          body: "Review total price, included work, exclusions, call-out fee, and earliest availability before accepting a quote.",
        },
      ],
      faq: [
        {
          q: "Is payment built in?",
          a: "Not yet. Quote acceptance and booking management are available today, while online payments are planned for a later release.",
        },
        {
          q: "Are pros verified?",
          a: "Operations can review profiles and mark verification status. A deeper document workflow and KYC process are planned next.",
        },
        {
          q: "Can customers chat live with pros?",
          a: "A message centre surface is available, but direct in-platform messaging is not live yet.",
        },
      ],
    };
  }

  return {
    hero: {
      eyebrow: "免費安排香港家居維修報價",
      title: "免費安排報價，先講清楚再比較。",
      description:
        "一次提交地址及維修要求，Hotfix 幫你安排師傅報價。確認前先比較價錢、時間及工程範圍。",
    },
    valuePoints: [
      "免費安排報價，確認前不需付款",
      "報價拆分人工、物料、上門費及最早時間",
      "一次提交需求，集中比較多位師傅",
    ],
    steps: [
      {
        title: "講清楚要整咩",
        body: "選擇工種、描述問題，並輸入完整香港地址及出入備註。",
      },
      {
        title: "師傅查看開放工作機會",
        body: "師傅可瀏覽開放需求，並按分類篩選，再決定是否提交報價。",
      },
      {
        title: "比較清楚先確認",
        body: "比較總價、人工、物料、上門費、包含項目及可上門時間，再接受合適報價。",
      },
    ],
    faq: [
      {
        q: "有冇內建付款？",
        a: "暫時未有。現時已支援接受報價及管理訂單狀態，網上付款會於後續版本加入。",
      },
      {
        q: "師傅是否已完成正式驗證？",
        a: "營運團隊可檢視師傅資料並標記驗證狀態，較完整的文件流程及 KYC 會於後續版本完善。",
      },
      {
        q: "客戶可否即時對話？",
        a: "現時已有訊息中心版面，但平台內即時對話仍在後續版本規劃中。",
      },
    ],
  };
}
