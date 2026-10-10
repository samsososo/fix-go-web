import { Locale } from "@/types/domain";

export function getMarketingContent(locale: Locale) {
  if (locale === "en") {
    return {
      hero: {
        eyebrow: "Free quote arrangement for Hong Kong home repairs",
        title: "Arrange free repair quotes, then compare before you confirm.",
        description:
          "Post the address and repair details once. 快修24 helps arrange structured quotes so you can compare price, timing, and scope before booking.",
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
          body: "Tradespeople can preview requests by category. Full details and quoting require an active subscription.",
        },
        {
          title: "Compare quotes before committing",
          body: "Review total price, included work, exclusions, call-out fee, and earliest availability before accepting a quote.",
        },
      ],
      faq: [
        {
          q: "How much is a professional subscription?",
          a: "Choose HK$100 for 1 month, HK$249 for 3 months, HK$449 for 6 months or HK$699 for 12 months. Each package is charged in full and renews automatically at the same interval. Average monthly prices are for comparison only.",
        },
        {
          q: "How does the free trial work?",
          a: "Each professional gets one 14-day trial after successful card setup. There is no charge during the trial. Changing a card, changing packages or rejoining does not grant another trial. Recorded trial end dates for existing trials are preserved.",
        },
        {
          q: "Can I cancel or get a refund?",
          a: "Cancel any time to stop the next renewal. Access remains until the trial or paid period ends. Cancel during the trial to avoid the first package payment. Paid package fees are not prorated or refunded. Cancellation does not waive outstanding fees.",
        },
        {
          q: "Do customers need to pay on the platform?",
          a: "Submitting a repair request and accepting a quote require no payment on the platform. Confirm the work charges and payment arrangements with your professional.",
        },
        {
          q: "How can I check a professional’s details?",
          a: "Professionals provide their trades, experience and service details. Before confirming work, ask them to confirm any relevant licences, qualifications and the agreed scope.",
        },
        {
          q: "How do I compare quotes?",
          a: "Open your repair request to compare labour, parts, call-out fees, included work and availability. Accept a suitable quote to create an order.",
        },
      ],
    };
  }

  return {
    hero: {
      eyebrow: "免費安排香港家居維修報價",
      title: "免費安排報價，先講清楚再比較。",
      description:
        "一次提交地址及維修要求，快修24 幫你安排師傅報價。確認前先比較價錢、時間及工程範圍。",
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
        body: "師傅可按工種預覽需求；查看完整工作資料、聯絡資料及提交報價，需要有效訂閱。",
      },
      {
        title: "比較清楚先確認",
        body: "比較總價、人工、物料、上門費、包含項目及可上門時間，再接受合適報價。",
      },
    ],
    faq: [
      {
        q: "師傅訂閱收費係點？",
        a: "可選 HK$100／1 個月、HK$249／3 個月、HK$449／6 個月或 HK$699／12 個月。每期一次過收取套餐全額，到期自動續訂同一套餐；平均月費只供比較。",
      },
      {
        q: "免費試用有幾耐？可以再用嗎？",
        a: "每位師傅享一次 14 日免費試用，由成功綁卡起計，試用期間不收費。換卡、換套餐或重新訂閱，均不會再送試用；已開始試用嘅帳戶保留原有已記錄到期日。",
      },
      {
        q: "取消訂閱會退款嗎？",
        a: "可隨時取消下期續費，使用權保留至免費試用或已付款週期完結。試用期內取消，不收首期套餐費；已收套餐費不作按比例退款。欠費期間取消亦不會豁免目前欠款。",
      },
      {
        q: "客戶需要喺平台付款嗎？",
        a: "提交維修需求及接受報價毋須喺平台付款。工程費用及付款安排，請與師傅確認。",
      },
      {
        q: "師傅資料點樣核對？",
        a: "師傅會提供工種、經驗及服務資料。確認工程前，請向師傅核對相關牌照、資格及工程範圍。",
      },
      {
        q: "點樣比較師傅報價？",
        a: "打開你嘅維修需求，逐項比較人工、物料、上門費、包含項目及可上門時間。揀選合適報價並確認後，就會建立訂單。",
      },
    ],
  };
}
