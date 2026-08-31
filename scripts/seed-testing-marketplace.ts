import { MongoClient } from "mongodb";

import { enableDatabaseSeeding, env } from "@/lib/env";
import {
  closeDb,
  createCredential,
  ensureProSubscription,
  listProSubscriptions,
  readDb,
  withDb,
} from "@/lib/mock/db";
import { calculateProTrialEndsAt } from "@/lib/subscription-policy";
import type { ProSubscription } from "@/lib/subscription-policy";
import type {
  Address,
  CustomerProfile,
  LanguageCode,
  NotificationItem,
  ProProfile,
  RequestUrgency,
  ServiceCategory,
  ServiceRequest,
  User,
} from "@/types/domain";

const CUSTOMER_COUNT = 50;
const PRO_COUNT = 50;
const REQUESTS_PER_CUSTOMER = 3;
const CUSTOMER_ID_PREFIX = "testing_customer_";
const PRO_ID_PREFIX = "testing_pro_";
const REQUEST_ID_PREFIX = "testing_request_";
const NOTIFICATION_ID_PREFIX = "testing_notification_";

type TestingAddressSeed = Pick<
  Address,
  "district" | "area" | "buildingEstate" | "block"
>;

// Public estate and block names from the Hong Kong Housing Authority's
// Public Housing Estates dataset. Private floors and flat numbers are omitted.
const TESTING_ADDRESSES: TestingAddressSeed[] = [
  {
    district: "Kwun Tong",
    area: "Kwun Tong",
    buildingEstate: "彩福邨",
    block: "彩樂樓",
  },
  {
    district: "Kwun Tong",
    area: "Kwun Tong",
    buildingEstate: "彩德邨",
    block: "彩誠樓",
  },
  {
    district: "Kwun Tong",
    area: "Kwun Tong",
    buildingEstate: "牛頭角上邨",
    block: "常滿樓",
  },
  {
    district: "Kwun Tong",
    area: "Kwun Tong",
    buildingEstate: "牛頭角下邨",
    block: "貴亮樓",
  },
  {
    district: "Kwun Tong",
    area: "Yau Tong",
    buildingEstate: "油麗邨",
    block: "碧麗樓",
  },
  {
    district: "Kwun Tong",
    area: "Lam Tin",
    buildingEstate: "藍田邨",
    block: "藍暉樓",
  },
  {
    district: "Kwun Tong",
    area: "Yau Tong",
    buildingEstate: "油塘邨",
    block: "富塘樓",
  },
  {
    district: "Kwun Tong",
    area: "Kwun Tong",
    buildingEstate: "彩盈邨",
    block: "盈富樓",
  },
  {
    district: "Kwun Tong",
    area: "Kwun Tong",
    buildingEstate: "坪石邨",
    block: "紅石樓",
  },
  {
    district: "Kwun Tong",
    area: "Yau Tong",
    buildingEstate: "高翔苑",
    block: "高恆閣",
  },
  {
    district: "Wong Tai Sin",
    area: "Diamond Hill",
    buildingEstate: "富山邨",
    block: "富禮樓",
  },
  {
    district: "Wong Tai Sin",
    area: "Chuk Yuen",
    buildingEstate: "橫頭磡邨",
    block: "宏澤樓",
  },
  {
    district: "Wong Tai Sin",
    area: "San Po Kong",
    buildingEstate: "美東邨",
    block: "美仁樓",
  },
  {
    district: "Wong Tai Sin",
    area: "Chuk Yuen",
    buildingEstate: "彩雲一邨",
    block: "伴月樓",
  },
  {
    district: "Wong Tai Sin",
    area: "Chuk Yuen",
    buildingEstate: "竹園北邨",
    block: "松園樓",
  },
  {
    district: "Wong Tai Sin",
    area: "Chuk Yuen",
    buildingEstate: "竹園南邨",
    block: "趣園樓",
  },
  {
    district: "Wong Tai Sin",
    area: "Chuk Yuen",
    buildingEstate: "黃大仙下二邨",
    block: "龍福樓",
  },
  {
    district: "Wong Tai Sin",
    area: "Diamond Hill",
    buildingEstate: "鳳德邨",
    block: "斑鳳樓",
  },
  {
    district: "Sha Tin",
    area: "Sha Tin",
    buildingEstate: "顯耀邨",
    block: "顯耀樓",
  },
  {
    district: "Sha Tin",
    area: "Sha Tin",
    buildingEstate: "美田邨",
    block: "美秀樓",
  },
  {
    district: "Sha Tin",
    area: "Sha Tin",
    buildingEstate: "新翠邨",
    block: "新俊樓",
  },
  {
    district: "Sha Tin",
    area: "Sha Tin",
    buildingEstate: "新田圍邨",
    block: "福圍樓",
  },
  {
    district: "Sha Tin",
    area: "Sha Tin",
    buildingEstate: "禾輋邨",
    block: "厚和樓",
  },
  {
    district: "Sha Tin",
    area: "Ma On Shan",
    buildingEstate: "耀安邨",
    block: "耀頌樓",
  },
  {
    district: "Sha Tin",
    area: "Sha Tin",
    buildingEstate: "隆亨邨",
    block: "慧心樓",
  },
  {
    district: "Sha Tin",
    area: "Sha Tin",
    buildingEstate: "美林邨",
    block: "美楓樓",
  },
  {
    district: "Sha Tin",
    area: "Sha Tin",
    buildingEstate: "沙角邨",
    block: "美雁樓",
  },
  {
    district: "Sha Tin",
    area: "Sha Tin",
    buildingEstate: "碩門邨",
    block: "健碩樓",
  },
  {
    district: "Tsuen Wan",
    area: "Tsuen Wan",
    buildingEstate: "梨木樹一邨",
    block: "楓樹樓",
  },
  {
    district: "Tsuen Wan",
    area: "Tsuen Wan",
    buildingEstate: "梨木樹二邨",
    block: "第一座",
  },
  {
    district: "Tsuen Wan",
    area: "Tsuen Wan",
    buildingEstate: "梨木樹邨",
    block: "康樹樓",
  },
  {
    district: "Tsuen Wan",
    area: "Tsuen Wan",
    buildingEstate: "福來邨",
    block: "永昌樓",
  },
  {
    district: "Tsuen Wan",
    area: "Tsuen Wan",
    buildingEstate: "石圍角邨",
    block: "石芳樓",
  },
  {
    district: "Eastern",
    area: "Chai Wan",
    buildingEstate: "漁灣邨",
    block: "漁豐樓",
  },
  {
    district: "Eastern",
    area: "Chai Wan",
    buildingEstate: "興華一邨",
    block: "卓華樓",
  },
  {
    district: "Eastern",
    area: "Chai Wan",
    buildingEstate: "興華二邨",
    block: "展興樓",
  },
  {
    district: "Eastern",
    area: "Quarry Bay",
    buildingEstate: "康東邨",
    block: "康瑞樓",
  },
  {
    district: "Eastern",
    area: "Quarry Bay",
    buildingEstate: "模範邨",
    block: "民順樓",
  },
  {
    district: "Eastern",
    area: "Chai Wan",
    buildingEstate: "愛東邨",
    block: "愛澤樓",
  },
  {
    district: "Eastern",
    area: "Chai Wan",
    buildingEstate: "小西灣邨",
    block: "瑞喜樓",
  },
  {
    district: "Eastern",
    area: "Chai Wan",
    buildingEstate: "翠樂邨",
    block: "翠祿樓",
  },
  {
    district: "Yuen Long",
    area: "Tin Shui Wai",
    buildingEstate: "俊宏軒",
    block: "第一座",
  },
  {
    district: "Yuen Long",
    area: "Yuen Long",
    buildingEstate: "朗屏邨",
    block: "鵲屏樓",
  },
  {
    district: "Yuen Long",
    area: "Yuen Long",
    buildingEstate: "水邊圍邨",
    block: "碧水樓",
  },
  {
    district: "Yuen Long",
    area: "Tin Shui Wai",
    buildingEstate: "天澤邨",
    block: "澤輝樓",
  },
  {
    district: "Yuen Long",
    area: "Tin Shui Wai",
    buildingEstate: "天瑞一邨",
    block: "瑞財樓",
  },
  {
    district: "Yuen Long",
    area: "Tin Shui Wai",
    buildingEstate: "天慈邨",
    block: "慈輝樓",
  },
  {
    district: "Yuen Long",
    area: "Tin Shui Wai",
    buildingEstate: "天耀一邨",
    block: "耀富樓",
  },
  {
    district: "Yuen Long",
    area: "Tin Shui Wai",
    buildingEstate: "天華邨",
    block: "華彩樓",
  },
  {
    district: "Yuen Long",
    area: "Tin Shui Wai",
    buildingEstate: "天恩邨",
    block: "恩樂樓",
  },
];

const REQUEST_COPY: Record<
  string,
  { title: string; description: string; budgetMin: number; budgetMax: number }
> = {
  "plumbing:leak": {
    title: "廚房水喉滲水，需要師傅檢查",
    description:
      "廚房洗手盆下方有持續滲水，已暫時關細水掣，希望安排檢查喉件及止水。",
    budgetMin: 450,
    budgetMax: 1_200,
  },
  "plumbing:drain": {
    title: "浴室去水慢，懷疑渠管堵塞",
    description: "沖涼後去水很慢並有輕微倒灌，希望師傅檢查及疏通渠管。",
    budgetMin: 500,
    budgetMax: 1_500,
  },
  "electrical:lighting": {
    title: "客廳燈具閃動，需要檢查電路",
    description: "客廳天花燈間歇閃動，更換燈膽後仍未改善，希望檢查燈具及接線。",
    budgetMin: 450,
    budgetMax: 1_300,
  },
  "electrical:socket": {
    title: "房間插蘇無電，需要維修",
    description:
      "其中一組牆身插蘇突然無電，其他位置正常，希望師傅安全檢查插座及線路。",
    budgetMin: 500,
    budgetMax: 1_500,
  },
  "aircon:cleaning": {
    title: "睡房冷氣需要深層清洗",
    description:
      "窗口式冷氣已有一段時間未清洗，開機後有異味，希望安排拆洗及基本檢查。",
    budgetMin: 500,
    budgetMax: 1_000,
  },
  "aircon:repair": {
    title: "冷氣不夠凍並有滴水",
    description:
      "冷氣運作後降溫很慢，偶爾有滴水，希望檢查去水、雪種及機件狀況。",
    budgetMin: 650,
    budgetMax: 1_800,
  },
  "cleaning:deep": {
    title: "兩房單位需要深層清潔",
    description:
      "希望集中清潔廚房、浴室及窗邊積塵，單位有人居住，傢俬會保留原位。",
    budgetMin: 900,
    budgetMax: 2_200,
  },
  "cleaning:move": {
    title: "入伙前全屋清潔",
    description: "單位裝修後準備入伙，需要清理櫃內、地面、玻璃及裝修後的灰塵。",
    budgetMin: 1_200,
    budgetMax: 3_000,
  },
  "renovation:paint": {
    title: "睡房牆身需要重新髹油",
    description:
      "牆身有輕微剝落及舊污漬，希望處理底層後重新髹油，顏色以淺色為主。",
    budgetMin: 2_000,
    budgetMax: 6_000,
  },
  "renovation:carpentry": {
    title: "廚櫃門鉸及層板需要維修",
    description:
      "兩隻廚櫃門下墜，其中一塊層板需要加固，希望上門度尺及提供修復方案。",
    budgetMin: 800,
    budgetMax: 2_800,
  },
};

function sequenceNumber(index: number) {
  return String(index + 1).padStart(3, "0");
}

function customerId(index: number) {
  return `${CUSTOMER_ID_PREFIX}${sequenceNumber(index)}`;
}

function proId(index: number) {
  return `${PRO_ID_PREFIX}${sequenceNumber(index)}`;
}

function assertSafeTarget() {
  if (env.NODE_ENV === "production") {
    throw new Error("Testing marketplace data cannot be seeded in production.");
  }
  if (!enableDatabaseSeeding) {
    throw new Error("ENABLE_DATABASE_SEEDING must be true.");
  }
  if (!env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required.");
  }
  if (env.MONGODB_DATABASE !== "hotfix_dev") {
    throw new Error(
      `Testing marketplace data may only target hotfix_dev; received ${env.MONGODB_DATABASE}.`,
    );
  }
  if (TESTING_ADDRESSES.length !== CUSTOMER_COUNT) {
    throw new Error(
      `Expected ${CUSTOMER_COUNT} public testing addresses; received ${TESTING_ADDRESSES.length}.`,
    );
  }
}

function categoryPairs(categories: ServiceCategory[]) {
  return categories.flatMap((category) =>
    category.subcategories.map((subcategory) => ({
      category,
      subcategory,
    })),
  );
}

function buildUsers(now: string) {
  const customers: User[] = Array.from(
    { length: CUSTOMER_COUNT },
    (_, index) => ({
      id: customerId(index),
      role: "customer",
      fullName: `測試客戶 ${sequenceNumber(index)}`,
      email: `testing.customer.${sequenceNumber(index)}@example.invalid`,
      phone: String(5_201_0001 + index),
      locale: "zh-HK",
      createdAt: now,
      lastLoginAt: now,
      phoneVerifiedAt: now,
    }),
  );
  const pros: User[] = Array.from({ length: PRO_COUNT }, (_, index) => ({
    id: proId(index),
    role: "pro",
    fullName: `測試師傅 ${sequenceNumber(index)}`,
    email: `testing.pro.${sequenceNumber(index)}@example.invalid`,
    phone: String(6_201_0001 + index),
    locale: "zh-HK",
    createdAt: now,
    lastLoginAt: now,
    phoneVerifiedAt: now,
  }));

  return { customers, pros };
}

function buildCustomerProfiles(): CustomerProfile[] {
  return TESTING_ADDRESSES.map((seed, index) => ({
    userId: customerId(index),
    preferredLanguage: "zh-HK",
    savedAddresses: [
      {
        id: `testing_saved_address_${sequenceNumber(index)}`,
        ...seed,
        landmarkNotes: "公開屋邨樓座測試地址；不包含真實住戶樓層或室號。",
      },
    ],
  }));
}

function buildProProfiles(
  categories: ServiceCategory[],
  districts: string[],
): ProProfile[] {
  const languageSets: LanguageCode[][] = [
    ["zh-HK", "yue"],
    ["zh-HK", "yue", "en"],
    ["yue", "en"],
  ];

  return Array.from({ length: PRO_COUNT }, (_, index) => {
    const category = categories[index % categories.length];
    return {
      userId: proId(index),
      displayName: `測試${category.name["zh-HK"]}師傅 ${sequenceNumber(index)}`,
      yearsOfExperience: 3 + (index % 18),
      serviceCategoryIds: [category.id],
      serviceAreaDistricts: [
        districts[index % districts.length],
        districts[(index + 3) % districts.length],
      ],
      languagesSpoken: languageSets[index % languageSets.length],
      introduction: `本帳戶只供本地測試。提供${category.name["zh-HK"]}服務，會先了解現場情況、清楚說明收費，再安排合適時間處理。`,
      emergencyAvailability: index % 3 === 0,
      verificationStatus: "verified",
      verificationLevel: "enhanced",
      documentPlaceholders: ["測試身份核實記錄", "測試專業資格記錄"],
      completedJobs: 12 + index * 3,
      avgResponseHours: Number((0.8 + (index % 8) * 0.4).toFixed(1)),
    };
  });
}

function buildRequests(
  categories: ServiceCategory[],
  proProfiles: ProProfile[],
  now: Date,
) {
  const pairs = categoryPairs(categories);
  const requests: ServiceRequest[] = [];
  const notifications: NotificationItem[] = [];

  for (
    let customerIndex = 0;
    customerIndex < CUSTOMER_COUNT;
    customerIndex += 1
  ) {
    for (
      let requestIndex = 0;
      requestIndex < REQUESTS_PER_CUSTOMER;
      requestIndex += 1
    ) {
      const requestOrdinal =
        customerIndex * REQUESTS_PER_CUSTOMER + requestIndex;
      const pair = pairs[requestOrdinal % pairs.length];
      const copy = REQUEST_COPY[
        `${pair.category.id}:${pair.subcategory.id}`
      ] ?? {
        title: `${pair.subcategory.name["zh-HK"]}服務需求`,
        description: `希望安排師傅處理${pair.category.name["zh-HK"]}的${pair.subcategory.name["zh-HK"]}服務，請先聯絡了解情況。`,
        budgetMin: 500,
        budgetMax: 2_000,
      };
      const matchedProIds = proProfiles
        .filter((profile) =>
          profile.serviceCategoryIds.includes(pair.category.id),
        )
        .map((profile) => profile.userId);
      const id = `${REQUEST_ID_PREFIX}${sequenceNumber(customerIndex)}_${String(requestIndex + 1).padStart(2, "0")}`;
      const createdAt = new Date(
        now.getTime() - (requestOrdinal % 30) * 24 * 60 * 60 * 1000,
      ).toISOString();
      const urgency: RequestUrgency = (
        ["asap", "today", "tomorrow", "scheduled"] as const
      )[requestOrdinal % 4];
      const scheduledDate =
        urgency === "scheduled"
          ? new Date(
              now.getTime() + (3 + (requestOrdinal % 10)) * 24 * 60 * 60 * 1000,
            ).toISOString()
          : undefined;
      const address: Address = {
        id: `testing_request_address_${sequenceNumber(customerIndex)}_${String(requestIndex + 1).padStart(2, "0")}`,
        ...TESTING_ADDRESSES[customerIndex],
        landmarkNotes: "公開屋邨樓座測試地址；不包含真實住戶樓層或室號。",
      };

      requests.push({
        id,
        customerId: customerId(customerIndex),
        title: `${copy.title}（測試 ${requestOrdinal + 1}）`,
        description: `${copy.description} 此為本地測試服務需求，請勿實際聯絡或上門。`,
        categoryId: pair.category.id,
        subcategoryId: pair.subcategory.id,
        urgency,
        scheduledDate,
        address,
        accessNotes: "測試資料：如需模擬流程，請勿直接聯絡管理處或住戶。",
        budgetMin: copy.budgetMin,
        budgetMax: copy.budgetMax,
        attachmentIds: [],
        status: "awaiting_quotes",
        matchedProIds,
        createdAt,
        updatedAt: createdAt,
      });

      matchedProIds.forEach((matchedProId, matchedIndex) => {
        notifications.push({
          id: `${NOTIFICATION_ID_PREFIX}${requestOrdinal + 1}_${matchedIndex + 1}`,
          userId: matchedProId,
          title: "新的測試服務需求",
          body: `${copy.title}（測試 ${requestOrdinal + 1}）`,
          read: requestOrdinal % 5 === 0,
          createdAt,
        });
      });
    }
  }

  return { requests, notifications };
}

function validateGeneratedData(input: {
  customers: User[];
  pros: User[];
  customerProfiles: CustomerProfile[];
  proProfiles: ProProfile[];
  requests: ServiceRequest[];
  categories: ServiceCategory[];
}) {
  const expectedRequests = CUSTOMER_COUNT * REQUESTS_PER_CUSTOMER;
  if (
    input.customers.length !== CUSTOMER_COUNT ||
    input.pros.length !== PRO_COUNT
  ) {
    throw new Error("Generated account totals are incorrect.");
  }
  if (
    input.customerProfiles.length !== CUSTOMER_COUNT ||
    input.proProfiles.length !== PRO_COUNT ||
    input.requests.length !== expectedRequests
  ) {
    throw new Error("Generated profile or request totals are incorrect.");
  }

  const pairs = categoryPairs(input.categories);
  const expectedPerPair = expectedRequests / pairs.length;
  if (!Number.isInteger(expectedPerPair)) {
    throw new Error(
      "Requests cannot be distributed evenly across subcategories.",
    );
  }
  pairs.forEach(({ category, subcategory }) => {
    const count = input.requests.filter(
      (request) =>
        request.categoryId === category.id &&
        request.subcategoryId === subcategory.id,
    ).length;
    if (count !== expectedPerPair) {
      throw new Error(
        `${category.id}:${subcategory.id} has ${count} requests; expected ${expectedPerPair}.`,
      );
    }
  });

  input.customers.forEach((customer) => {
    const count = input.requests.filter(
      (request) => request.customerId === customer.id,
    ).length;
    if (count !== REQUESTS_PER_CUSTOMER) {
      throw new Error(`${customer.id} has ${count} requests.`);
    }
  });
  if (input.requests.some((request) => request.matchedProIds.length === 0)) {
    throw new Error(
      "Every testing request must match at least one testing pro.",
    );
  }
}

async function seedProfilesAndRequests() {
  const now = new Date();
  return withDb((db) => {
    if (db.categories.length === 0 || db.districts.length === 0) {
      throw new Error(
        "Service categories and districts must already be seeded.",
      );
    }
    const { customers, pros } = buildUsers(now.toISOString());
    const customerProfiles = buildCustomerProfiles();
    const proProfiles = buildProProfiles(
      db.categories,
      db.districts.map((entry) => entry.district),
    );
    const { requests, notifications } = buildRequests(
      db.categories,
      proProfiles,
      now,
    );

    validateGeneratedData({
      customers,
      pros,
      customerProfiles,
      proProfiles,
      requests,
      categories: db.categories,
    });

    db.users = db.users
      .filter(
        (user) =>
          !user.id.startsWith(CUSTOMER_ID_PREFIX) &&
          !user.id.startsWith(PRO_ID_PREFIX),
      )
      .concat(customers, pros);
    db.customerProfiles = db.customerProfiles
      .filter((profile) => !profile.userId.startsWith(CUSTOMER_ID_PREFIX))
      .concat(customerProfiles);
    db.proProfiles = db.proProfiles
      .filter((profile) => !profile.userId.startsWith(PRO_ID_PREFIX))
      .concat(proProfiles);
    db.requests = db.requests
      .filter((request) => !request.id.startsWith(REQUEST_ID_PREFIX))
      .concat(requests);
    db.attachments = db.attachments.filter(
      (attachment) => !attachment.requestId.startsWith(REQUEST_ID_PREFIX),
    );
    const removedQuoteIds = new Set(
      db.quotes
        .filter((quote) => quote.requestId.startsWith(REQUEST_ID_PREFIX))
        .map((quote) => quote.id),
    );
    db.quotes = db.quotes.filter(
      (quote) => !quote.requestId.startsWith(REQUEST_ID_PREFIX),
    );
    const removedBookingIds = new Set(
      db.bookings
        .filter((booking) => booking.requestId.startsWith(REQUEST_ID_PREFIX))
        .map((booking) => booking.id),
    );
    db.bookings = db.bookings.filter(
      (booking) => !booking.requestId.startsWith(REQUEST_ID_PREFIX),
    );
    db.bookingStatusEvents = db.bookingStatusEvents.filter(
      (event) => !removedBookingIds.has(event.bookingId),
    );
    db.notifications = db.notifications
      .filter(
        (notification) => !notification.id.startsWith(NOTIFICATION_ID_PREFIX),
      )
      .concat(notifications);
    db.adminNotes = db.adminNotes.filter(
      (note) =>
        !note.entityId.startsWith(CUSTOMER_ID_PREFIX) &&
        !note.entityId.startsWith(PRO_ID_PREFIX) &&
        !note.entityId.startsWith(REQUEST_ID_PREFIX) &&
        !removedQuoteIds.has(note.entityId) &&
        !removedBookingIds.has(note.entityId),
    );

    return {
      customers,
      pros,
      customerProfiles,
      proProfiles,
      requests,
      categories: db.categories,
    };
  });
}

async function seedCredentials(users: User[]) {
  await Promise.all(
    users.map((user) => createCredential(user.id, env.DEMO_PASSWORD, false)),
  );
}

async function seedTrialSubscriptions(pros: User[]) {
  await Promise.all(pros.map((pro) => ensureProSubscription(pro.id)));
  if (!env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required.");
  }

  const client = await new MongoClient(env.MONGODB_URI, {
    ignoreUndefined: true,
  }).connect();
  try {
    const collection = client
      .db(env.MONGODB_DATABASE)
      .collection<ProSubscription & { _id: string }>("proSubscriptions");
    const trialStartedAt = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const trialEndsAt = calculateProTrialEndsAt(trialStartedAt);
    await collection.bulkWrite(
      pros.map((pro, index) => {
        const suffix = sequenceNumber(index);
        return {
          updateOne: {
            filter: { _id: pro.id },
            update: {
              $set: {
                accessStatus: "trialing",
                stripeCustomerId: `cus_test_testing_${suffix}`,
                stripeSubscriptionId: `sub_test_testing_${suffix}`,
                stripePriceId: "price_test_testing_pro_monthly",
                stripeStatus: "trialing",
                stripeLivemode: false,
                stripeSubscriptionHasTrial: true,
                stripeSetupIntentId: `seti_test_testing_${suffix}`,
                stripePaymentMethodId: `pm_test_testing_${suffix}`,
                cardBoundAt: trialStartedAt,
                trialConsumedAt: trialStartedAt,
                trialGrantedAt: trialStartedAt,
                trialStartedAt,
                trialEndsAt,
                currentPeriodStartedAt: trialStartedAt,
                currentPeriodEndsAt: trialEndsAt,
                cancelAtPeriodEnd: false,
                lastStripeEventId: `evt_test_testing_${suffix}`,
                lastStripeEventCreatedAt: trialStartedAt,
                lastStripeSyncedAt: trialStartedAt,
                stripeLifecycleRevision: 1,
                updatedAt: trialStartedAt,
              },
              $unset: {
                checkoutSessionId: "",
                checkoutSessionExpiresAt: "",
                checkoutReservationId: "",
                checkoutReservationExpiresAt: "",
                reactivationCheckoutSessionId: "",
                reactivationCheckoutSessionExpiresAt: "",
                reactivationCheckoutReservationId: "",
                reactivationCheckoutReservationExpiresAt: "",
                cancellationRequestedAt: "",
                pastDueInvoiceId: "",
                firstPaymentFailedAt: "",
                paymentFailureConfirmed: "",
                gracePeriodEndsAt: "",
                terminatedAt: "",
              },
            },
          },
        };
      }),
    );
  } finally {
    await client.close();
  }
}

async function verifyPersistedData(categories: ServiceCategory[]) {
  const [db, subscriptions] = await Promise.all([
    readDb(),
    listProSubscriptions(),
  ]);
  const customers = db.users.filter((user) =>
    user.id.startsWith(CUSTOMER_ID_PREFIX),
  );
  const pros = db.users.filter((user) => user.id.startsWith(PRO_ID_PREFIX));
  const customerProfiles = db.customerProfiles.filter((profile) =>
    profile.userId.startsWith(CUSTOMER_ID_PREFIX),
  );
  const proProfiles = db.proProfiles.filter((profile) =>
    profile.userId.startsWith(PRO_ID_PREFIX),
  );
  const requests = db.requests.filter((request) =>
    request.id.startsWith(REQUEST_ID_PREFIX),
  );
  validateGeneratedData({
    customers,
    pros,
    customerProfiles,
    proProfiles,
    requests,
    categories,
  });

  const testingProIds = new Set(pros.map((pro) => pro.id));
  const trialingSubscriptions = subscriptions.filter(
    (subscription) =>
      testingProIds.has(subscription.proId) &&
      subscription.accessStatus === "trialing" &&
      subscription.stripeStatus === "trialing" &&
      Boolean(subscription.cardBoundAt) &&
      Boolean(subscription.trialConsumedAt) &&
      Boolean(subscription.trialEndsAt),
  );
  if (trialingSubscriptions.length !== PRO_COUNT) {
    throw new Error(
      `Expected ${PRO_COUNT} trialing testing subscriptions; received ${trialingSubscriptions.length}.`,
    );
  }

  const pairCounts = Object.fromEntries(
    categoryPairs(categories).map(({ category, subcategory }) => [
      `${category.name["zh-HK"]}／${subcategory.name["zh-HK"]}`,
      requests.filter(
        (request) =>
          request.categoryId === category.id &&
          request.subcategoryId === subcategory.id,
      ).length,
    ]),
  );

  return {
    customers: customers.length,
    pros: pros.length,
    requests: requests.length,
    requestsPerCustomer: REQUESTS_PER_CUSTOMER,
    trialingSubscriptions: trialingSubscriptions.length,
    customerPhoneRange: `${customers[0]?.phone}–${customers.at(-1)?.phone}`,
    proPhoneRange: `${pros[0]?.phone}–${pros.at(-1)?.phone}`,
    pairCounts,
  };
}

async function main() {
  assertSafeTarget();
  try {
    const generated = await seedProfilesAndRequests();
    await seedCredentials([...generated.customers, ...generated.pros]);
    await seedTrialSubscriptions(generated.pros);
    const summary = await verifyPersistedData(generated.categories);
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await closeDb();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
