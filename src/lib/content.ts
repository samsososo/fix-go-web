import { Locale } from "@/types/domain";

export function getMarketingContent(locale: Locale) {
  if (locale === "en") {
    return {
      hero: {
        eyebrow: "Hong Kong home repair quotes, made clearer",
        title: "Find the right pro for home repairs without endless calls.",
        description:
          "Post one clear request, add photos and a Hong Kong address, then compare structured quotes for plumbing, electrical, air conditioning, cleaning, and other home-service jobs.",
      },
      valuePoints: [
        "Clear briefs with photos, urgency, budget, and access notes",
        "Quotes split by labour, parts, call-out fee, and availability",
        "One workflow for customers, pros, bookings, and ops review",
      ],
      steps: [
        {
          title: "Tell us what needs fixing",
          body: "Choose a trade, describe the issue, upload photos, and add a structured Hong Kong address.",
        },
        {
          title: "Relevant pros review the lead",
          body: "Tradespeople see jobs that match their category and service districts before deciding whether to quote.",
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
      eyebrow: "香港家居維修報價，清楚比較先決定",
      title: "搵師傅唔使逐個問價，一次提交需求就可以比較報價。",
      description:
        "Hotfix 幫香港住戶提交家居維修需求、上傳相片及地址，再集中比較水喉、電力、冷氣、清潔等師傅報價。",
    },
    valuePoints: [
      "一次填好相片、預算、緊急程度及出入備註",
      "報價拆分人工、物料、上門費及最早時間",
      "客戶、師傅、訂單及營運覆核共用同一流程",
    ],
    steps: [
      {
        title: "講清楚要整咩",
        body: "選擇工種、描述問題、上傳相片，並輸入完整香港地址及出入備註。",
      },
      {
        title: "合適師傅查看工作機會",
        body: "師傅按工種及服務地區看到相關需求，再決定是否提交報價。",
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
