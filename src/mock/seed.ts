import { MockDb } from "@/types/domain";

export function createSeedDb(): MockDb {
  const now = "2026-04-03T08:00:00.000Z";

  return {
    users: [
      {
        id: "user_customer_amy",
        role: "customer",
        fullName: "陳小姐",
        email: "amy@hotfix.hk",
        phone: "91234567",
        locale: "zh-HK",
        createdAt: now,
        lastLoginAt: now,
      },
      {
        id: "user_customer_ben",
        role: "customer",
        fullName: "Ben Lee",
        email: "ben@hotfix.hk",
        phone: "93456789",
        locale: "en",
        createdAt: now,
        lastLoginAt: now,
      },
      {
        id: "user_pro_chan",
        role: "pro",
        fullName: "陳師傅",
        email: "chan@hotfix.hk",
        phone: "92345678",
        locale: "zh-HK",
        createdAt: now,
        lastLoginAt: now,
      },
      {
        id: "user_pro_wong",
        role: "pro",
        fullName: "Wong Electric",
        email: "wong@hotfix.hk",
        phone: "95678901",
        locale: "en",
        createdAt: now,
        lastLoginAt: now,
      },
      {
        id: "user_admin",
        role: "admin",
        fullName: "Hotfix Ops",
        email: "ops@hotfix.hk",
        phone: "90000000",
        locale: "zh-HK",
        createdAt: now,
        lastLoginAt: now,
      },
    ],
    customerProfiles: [
      {
        userId: "user_customer_amy",
        preferredLanguage: "zh-HK",
        savedAddresses: [
          {
            id: "addr_amy_home",
            district: "Kwun Tong",
            area: "Lam Tin",
            buildingEstate: "匯景花園",
            block: "第 7 座",
            floor: "18/F",
            flatRoom: "A",
            landmarkNotes: "港鐵 A 出口附近",
          },
        ],
      },
      {
        userId: "user_customer_ben",
        preferredLanguage: "en",
        savedAddresses: [],
      },
    ],
    proProfiles: [
      {
        userId: "user_pro_chan",
        displayName: "陳記冷氣水電",
        yearsOfExperience: 12,
        serviceCategoryIds: ["aircon", "plumbing"],
        serviceAreaDistricts: ["Kwun Tong", "Wong Tai Sin", "Sha Tin"],
        languagesSpoken: ["zh-HK", "yue"],
        introduction:
          "處理家居冷氣清洗、滴水、去水堵塞及一般水電維修。可提供即日初步回覆。",
        emergencyAvailability: true,
        verificationStatus: "verified",
        verificationLevel: "enhanced",
        documentPlaceholders: ["BR copy", "HKID placeholder"],
        completedJobs: 146,
        avgResponseHours: 1.8,
      },
      {
        userId: "user_pro_wong",
        displayName: "Wong Electric Co.",
        yearsOfExperience: 8,
        serviceCategoryIds: ["electrical"],
        serviceAreaDistricts: ["Wan Chai", "Eastern", "Central and Western"],
        languagesSpoken: ["en", "zh-HK"],
        introduction:
          "Licensed electrician handling lighting, switch, power socket and DB box jobs.",
        emergencyAvailability: false,
        verificationStatus: "pending",
        verificationLevel: "basic",
        documentPlaceholders: ["License placeholder"],
        completedJobs: 74,
        avgResponseHours: 4.2,
      },
    ],
    categories: [
      {
        id: "plumbing",
        name: { "zh-HK": "水喉維修", en: "Plumbing" },
        description: {
          "zh-HK": "漏水、去水、龍頭、更換潔具",
          en: "Leaks, drainage, taps and bathroom fittings",
        },
        subcategories: [
          { id: "leak", name: { "zh-HK": "漏水", en: "Leak repair" } },
          { id: "drain", name: { "zh-HK": "渠管堵塞", en: "Drain blockage" } },
        ],
      },
      {
        id: "electrical",
        name: { "zh-HK": "電力工程", en: "Electrical" },
        description: {
          "zh-HK": "燈掣、插蘇、跳掣、配電箱",
          en: "Lighting, sockets, circuit trips and DB boards",
        },
        subcategories: [
          { id: "lighting", name: { "zh-HK": "燈具維修", en: "Lighting" } },
          { id: "socket", name: { "zh-HK": "插蘇問題", en: "Socket repair" } },
        ],
      },
      {
        id: "aircon",
        name: { "zh-HK": "冷氣工程", en: "Air conditioning" },
        description: {
          "zh-HK": "清洗、滴水、唔凍、安裝",
          en: "Cleaning, leaks, no-cool and installation",
        },
        subcategories: [
          { id: "cleaning", name: { "zh-HK": "冷氣清洗", en: "AC cleaning" } },
          { id: "repair", name: { "zh-HK": "冷氣維修", en: "AC repair" } },
        ],
      },
      {
        id: "cleaning",
        name: { "zh-HK": "家居清潔", en: "Home cleaning" },
        description: {
          "zh-HK": "單次、深層、入伙前後清潔",
          en: "One-off, deep clean, move-in and move-out",
        },
        subcategories: [
          { id: "deep", name: { "zh-HK": "深層清潔", en: "Deep clean" } },
          { id: "move", name: { "zh-HK": "入伙清潔", en: "Move-in clean" } },
        ],
      },
      {
        id: "renovation",
        name: { "zh-HK": "裝修雜項", en: "Renovation" },
        description: {
          "zh-HK": "油漆、泥水、木工、小型翻新",
          en: "Painting, masonry, carpentry and minor renovation",
        },
        subcategories: [
          { id: "paint", name: { "zh-HK": "油漆", en: "Painting" } },
          { id: "carpentry", name: { "zh-HK": "木工", en: "Carpentry" } },
        ],
      },
    ],
    districts: [
      {
        district: "Central and Western",
        areas: ["Central", "Sheung Wan", "Sai Ying Pun"],
      },
      {
        district: "Wan Chai",
        areas: ["Wan Chai", "Causeway Bay", "Happy Valley"],
      },
      { district: "Eastern", areas: ["Quarry Bay", "Tai Koo", "Chai Wan"] },
      {
        district: "Kwun Tong",
        areas: ["Kwun Tong", "Lam Tin", "Yau Tong"],
      },
      {
        district: "Wong Tai Sin",
        areas: ["Diamond Hill", "San Po Kong", "Chuk Yuen"],
      },
      { district: "Sha Tin", areas: ["Sha Tin", "Ma On Shan", "Fo Tan"] },
      { district: "Tsuen Wan", areas: ["Tsuen Wan", "Kwai Fong", "Tsing Yi"] },
      {
        district: "Yuen Long",
        areas: ["Yuen Long", "Tin Shui Wai", "Hung Shui Kiu"],
      },
    ],
    addresses: [
      {
        id: "addr_seed_1",
        district: "Kwun Tong",
        area: "Lam Tin",
        buildingEstate: "匯景花園",
        block: "第 7 座",
        floor: "18/F",
        flatRoom: "A",
        landmarkNotes: "港鐵 A 出口附近",
      },
    ],
    attachments: [
      {
        id: "att_1",
        requestId: "req_1",
        fileName: "ac-leak.jpg",
        mimeType: "image/jpeg",
        uploadedAt: now,
      },
    ],
    requests: [
      {
        id: "req_1",
        customerId: "user_customer_amy",
        title: "客廳冷氣滴水，需要盡快處理",
        description: "1.5 匹窗口機滴水，晚間更嚴重，想盡快安排上門檢查及清洗。",
        categoryId: "aircon",
        subcategoryId: "repair",
        urgency: "asap",
        address: {
          id: "addr_req_1",
          district: "Kwun Tong",
          area: "Lam Tin",
          buildingEstate: "匯景花園",
          block: "第 7 座",
          floor: "18/F",
          flatRoom: "A",
          landmarkNotes: "港鐵 A 出口附近",
        },
        accessNotes: "管理處 9am 後可安排登記",
        budgetMin: 600,
        budgetMax: 1200,
        attachmentIds: ["att_1"],
        status: "quoted",
        matchedProIds: ["user_pro_chan"],
        createdAt: now,
        updatedAt: now,
      },
    ],
    quotes: [
      {
        id: "quote_1",
        requestId: "req_1",
        proId: "user_pro_chan",
        quoteAmount: 780,
        labourEstimate: 500,
        partsEstimate: 180,
        callOutFee: 100,
        total: 780,
        includedWork: "檢查去水盤、清洗濾網及基本疏通去水喉",
        exclusions: "如需更換主板或壓縮機會另行報價",
        earliestAvailability: "2026-04-03T10:00:00.000Z",
        noteToCustomer: "可於今天下午上門，完成後會測試滴水情況。",
        status: "sent",
        createdAt: now,
        updatedAt: now,
      },
    ],
    bookings: [],
    bookingStatusEvents: [],
    notifications: [
      {
        id: "note_1",
        userId: "user_customer_amy",
        title: "收到新報價",
        body: "陳記冷氣水電 已提交報價。",
        read: false,
        createdAt: now,
      },
    ],
    adminNotes: [
      {
        id: "admin_note_1",
        entityType: "pro",
        entityId: "user_pro_wong",
        body: "Waiting for address proof placeholder.",
        createdAt: now,
        createdByUserId: "user_admin",
      },
    ],
  };
}
