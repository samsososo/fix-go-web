import { listCredentialedDemoUsers, readDb, withDb } from "@/lib/mock/db";
import {
  listMongoCategoryOptions,
  listMongoProCalendarBookings,
  listMongoProJobs,
  listMongoRelevantLeads,
} from "@/lib/mock/mongo-db";
import {
  canTransitionBookingStatus,
  canTransitionRequestStatus,
} from "@/lib/status";
import { formatStatusLabel } from "@/lib/formatters";
import { createId, nowIso } from "@/lib/utils";
import {
  AdminNote,
  Address,
  Booking,
  BookingStatusEvent,
  BookingStatus,
  Locale,
  ProProfile,
  Quote,
  RequestStatus,
  ServiceCategory,
  ServiceRequest,
  User,
} from "@/types/domain";
import {
  ProProfileInput,
  QuoteFormInput,
  RequestFormInput,
  SignupInput,
} from "@/lib/validation";

function findUser(users: User[], userId: string) {
  const user = users.find((entry) => entry.id === userId);
  if (!user) {
    throw new Error("User not found");
  }

  return user;
}

function findProProfile(profiles: ProProfile[], userId: string) {
  const profile = profiles.find((entry) => entry.userId === userId);
  if (!profile) {
    throw new Error("Pro profile not found");
  }

  return profile;
}

function textForLocale(locale: string, en: string, zh: string) {
  return locale === "en" ? en : zh;
}

function summarizeProfileCompletion(profile: ProProfile) {
  const checks = [
    Boolean(profile.displayName),
    profile.yearsOfExperience > 0,
    profile.languagesSpoken.length > 0,
    profile.introduction.length >= 30,
    profile.documentPlaceholders.length > 0,
  ];

  const done = checks.filter(Boolean).length;
  return Math.round((done / checks.length) * 100);
}

const openLeadStatuses: RequestStatus[] = [
  "submitted",
  "awaiting_quotes",
  "quoted",
];

function isOpenLead(request: ServiceRequest) {
  return openLeadStatuses.includes(request.status);
}

function matchProsForRequest(proProfiles: ProProfile[], categoryId: string) {
  return proProfiles
    .filter((profile) => profile.serviceCategoryIds.includes(categoryId))
    .map((profile) => profile.userId);
}

function hydrateRequest(
  request: ServiceRequest,
  categories: ServiceCategory[],
  users: User[],
  quotes: Quote[],
  bookings: Booking[],
) {
  const customer =
    users.find((entry) => entry.id === request.customerId) ?? null;
  const category =
    categories.find((entry) => entry.id === request.categoryId) ?? null;
  const requestQuotes = quotes.filter(
    (entry) => entry.requestId === request.id,
  );
  const booking =
    bookings.find((entry) => entry.requestId === request.id) ?? null;

  return {
    ...request,
    customer,
    category,
    quotes: requestQuotes,
    booking,
  };
}

function hydrateBooking(
  booking: Booking,
  requests: ServiceRequest[],
  users: User[],
  quotes: Quote[],
  bookingStatusEvents: BookingStatusEvent[],
) {
  return {
    ...booking,
    request:
      requests.find((request) => request.id === booking.requestId) ?? null,
    customer: users.find((user) => user.id === booking.customerId) ?? null,
    pro: users.find((user) => user.id === booking.proId) ?? null,
    quote: quotes.find((quote) => quote.id === booking.quoteId) ?? null,
    timeline: bookingStatusEvents.filter(
      (event) => event.bookingId === booking.id,
    ),
  };
}

function mapRequestStatusToBookingStatus(
  status: RequestStatus,
): BookingStatus | null {
  const mapping: Record<RequestStatus, BookingStatus | null> = {
    accepted: "accepted",
    scheduled: "scheduled",
    in_progress: "in_progress",
    completed: "completed",
    cancelled: "cancelled",
    draft: null,
    submitted: null,
    awaiting_quotes: null,
    quoted: null,
  };

  return mapping[status];
}

export async function listPublicCategories() {
  const db = await readDb();
  return db.categories.filter((category) => category.id !== "cleaning");
}

export async function listDistricts() {
  const db = await readDb();
  return db.districts;
}

export async function listDemoUsers() {
  return listCredentialedDemoUsers();
}

export async function findUserByIdentifier(identifier: string) {
  const db = await readDb();
  const normalizedIdentifier = identifier.trim().toLowerCase();
  return (
    db.users.find(
      (user) =>
        user.email?.toLowerCase() === normalizedIdentifier ||
        user.phone === identifier.replace(/\D/g, ""),
    ) ?? null
  );
}

export async function createUserAccount(
  input: SignupInput,
  options: { phoneVerifiedAt?: string } = {},
) {
  return withDb((db) => {
    const normalizedEmail = input.email?.trim().toLowerCase() || "";
    const existing = db.users.find(
      (user) =>
        user.phone === input.phone ||
        (normalizedEmail.length > 0 &&
          user.email?.toLowerCase() === normalizedEmail),
    );
    if (existing) {
      throw new Error("An account with this email or phone already exists.");
    }

    const user: User = {
      id: createId(`user_${input.role}`),
      role: input.role,
      fullName: input.fullName,
      email: normalizedEmail || undefined,
      phone: input.phone,
      locale: input.locale,
      createdAt: nowIso(),
      lastLoginAt: nowIso(),
      phoneVerifiedAt: options.phoneVerifiedAt,
    };

    db.users.push(user);

    if (input.role === "customer") {
      db.customerProfiles.push({
        userId: user.id,
        preferredLanguage: input.locale,
        savedAddresses: [],
      });
    }

    if (input.role === "pro") {
      db.proProfiles.push({
        userId: user.id,
        displayName: user.fullName,
        yearsOfExperience: 0,
        serviceCategoryIds: input.serviceCategoryIds ?? [],
        serviceAreaDistricts: [],
        languagesSpoken: [input.locale],
        introduction: "",
        emergencyAvailability: false,
        verificationStatus: "unverified",
        verificationLevel: "none",
        documentPlaceholders: [],
        completedJobs: 0,
        avgResponseHours: 0,
      });
    }

    return user;
  });
}

export async function getCustomerDashboard(customerId: string) {
  const db = await readDb();
  const requests = db.requests
    .filter((request) => request.customerId === customerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    requests,
    stats: {
      active: requests.filter((request) =>
        [
          "submitted",
          "awaiting_quotes",
          "quoted",
          "accepted",
          "scheduled",
          "in_progress",
        ].includes(request.status),
      ).length,
      awaitingQuotes: requests.filter((request) =>
        ["submitted", "awaiting_quotes"].includes(request.status),
      ).length,
      acceptedBookings: requests.filter((request) =>
        ["accepted", "scheduled", "in_progress"].includes(request.status),
      ).length,
      completed: requests.filter((request) => request.status === "completed")
        .length,
    },
    activity: db.notifications
      .filter((item) => item.userId === customerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5),
  };
}

export async function createCustomerRequest(
  customerId: string,
  input: RequestFormInput,
  locale: string,
) {
  return withDb((db) => {
    const requestId = createId("req");
    const address: Address = {
      id: createId("addr"),
      ...input.address,
    };
    const matchedProIds = matchProsForRequest(db.proProfiles, input.categoryId);
    const status: RequestStatus =
      matchedProIds.length > 0 ? "awaiting_quotes" : "submitted";

    db.addresses.push(address);

    const request: ServiceRequest = {
      id: requestId,
      customerId,
      title: input.title,
      description: input.description,
      categoryId: input.categoryId,
      subcategoryId: input.subcategoryId,
      urgency: input.urgency,
      scheduledDate: input.scheduledDate,
      address,
      accessNotes: input.accessNotes,
      budgetMin: input.budgetMin,
      budgetMax: input.budgetMax,
      attachmentIds: [],
      status,
      matchedProIds,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    db.requests.push(request);
    db.notifications.push(
      ...matchedProIds.map((proId) => ({
        id: createId("notif"),
        userId: proId,
        title: textForLocale(locale, "New service request", "新的服務需求"),
        body: request.title,
        read: false,
        createdAt: nowIso(),
      })),
    );

    return request;
  });
}

export async function listCustomerRequests(customerId: string) {
  const db = await readDb();
  return db.requests
    .filter((request) => request.customerId === customerId)
    .map((request) =>
      hydrateRequest(request, db.categories, db.users, db.quotes, db.bookings),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getCustomerRequestDetail(
  customerId: string,
  requestId: string,
) {
  const db = await readDb();
  const request = db.requests.find(
    (entry) => entry.id === requestId && entry.customerId === customerId,
  );

  if (!request) {
    return null;
  }

  return {
    ...hydrateRequest(request, db.categories, db.users, db.quotes, db.bookings),
    attachments: db.attachments.filter(
      (entry) => entry.requestId === request.id,
    ),
    timeline: db.bookingStatusEvents.filter((entry) =>
      db.bookings.some(
        (booking) =>
          booking.id === entry.bookingId && booking.requestId === request.id,
      ),
    ),
  };
}

export async function getCustomerBookingDetail(
  customerId: string,
  bookingId: string,
) {
  const db = await readDb();
  const booking = db.bookings.find(
    (entry) => entry.id === bookingId && entry.customerId === customerId,
  );
  if (!booking) {
    return null;
  }

  return hydrateBooking(
    booking,
    db.requests,
    db.users,
    db.quotes,
    db.bookingStatusEvents,
  );
}

export async function listCustomerCalendarBookings(customerId: string) {
  const db = await readDb();
  return db.bookings
    .filter(
      (booking) =>
        booking.customerId === customerId && booking.status !== "cancelled",
    )
    .map((booking) =>
      hydrateBooking(
        booking,
        db.requests,
        db.users,
        db.quotes,
        db.bookingStatusEvents,
      ),
    )
    .sort((a, b) =>
      (a.scheduledDate ?? a.updatedAt).localeCompare(
        b.scheduledDate ?? b.updatedAt,
      ),
    );
}

export async function listCustomerMessages(customerId: string) {
  const db = await readDb();
  return db.notifications
    .filter((item) => item.userId === customerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function acceptCustomerQuote(
  customerId: string,
  requestId: string,
  quoteId: string,
  locale: string,
) {
  return withDb((db) => {
    const request = db.requests.find(
      (entry) => entry.id === requestId && entry.customerId === customerId,
    );
    if (!request) {
      throw new Error("Request not found");
    }

    const quote = db.quotes.find(
      (entry) => entry.id === quoteId && entry.requestId === requestId,
    );
    if (!quote) {
      throw new Error("Quote not found");
    }

    db.quotes.forEach((entry) => {
      if (entry.requestId === requestId) {
        entry.status = entry.id === quoteId ? "accepted" : "rejected";
        entry.updatedAt = nowIso();
      }
    });

    request.acceptedQuoteId = quoteId;
    request.status = "accepted";
    request.updatedAt = nowIso();

    const bookingId = createId("booking");
    const eventId = createId("book_event");
    db.bookings.push({
      id: bookingId,
      requestId,
      quoteId,
      customerId,
      proId: quote.proId,
      status: "accepted",
      scheduledDate: quote.earliestAvailability,
      estimatedDurationMinutes: quote.estimatedDurationMinutes,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      statusEventIds: [eventId],
    });

    db.bookingStatusEvents.push({
      id: eventId,
      bookingId,
      status: "accepted",
      note: textForLocale(
        locale,
        "Customer accepted the quote.",
        "客戶已接受報價。",
      ),
      createdAt: nowIso(),
      createdByUserId: customerId,
    });

    db.notifications.push({
      id: createId("notif"),
      userId: quote.proId,
      title: textForLocale(locale, "Quote accepted", "報價已被接受"),
      body: request.title,
      read: false,
      createdAt: nowIso(),
    });

    return quote;
  });
}

export async function getProDashboard(proId: string) {
  const db = await readDb();
  const profile = findProProfile(db.proProfiles, proId);
  const leads = db.requests.filter(
    (request) => isOpenLead(request) && request.matchedProIds.includes(proId),
  );
  const quotes = db.quotes.filter((quote) => quote.proId === proId);
  const jobs = db.bookings.filter((booking) => booking.proId === proId);

  return {
    profile,
    profileCompletion: summarizeProfileCompletion(profile),
    stats: {
      newLeads: leads.length,
      quotesSent: quotes.filter((quote) => quote.status === "sent").length,
      acceptedJobs: jobs.filter((job) =>
        ["accepted", "scheduled", "in_progress"].includes(job.status),
      ).length,
    },
    activity: db.notifications
      .filter((item) => item.userId === proId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5),
  };
}

export async function getProProfile(userId: string) {
  const db = await readDb();
  return findProProfile(db.proProfiles, userId);
}

export async function saveProProfile(userId: string, input: ProProfileInput) {
  return withDb((db) => {
    const profile = findProProfile(db.proProfiles, userId);
    Object.assign(profile, input);
    profile.verificationStatus =
      input.documentPlaceholders.length > 0
        ? "pending"
        : profile.verificationStatus;
    profile.verificationLevel =
      input.documentPlaceholders.length > 1
        ? "basic"
        : profile.verificationLevel;
    return profile;
  });
}

export async function listRelevantLeads(proId: string, categoryId?: string) {
  return listMongoRelevantLeads(proId, categoryId);
}

export async function getLeadDetail(proId: string, requestId: string) {
  const db = await readDb();
  const request = db.requests.find(
    (entry) =>
      entry.id === requestId &&
      isOpenLead(entry) &&
      entry.matchedProIds.includes(proId),
  );
  if (!request) {
    return null;
  }

  return {
    ...request,
    customer: findUser(db.users, request.customerId),
    category:
      db.categories.find((entry) => entry.id === request.categoryId) ?? null,
    attachments: db.attachments.filter(
      (entry) => entry.requestId === request.id,
    ),
    existingQuote:
      db.quotes.find(
        (quote) => quote.requestId === request.id && quote.proId === proId,
      ) ?? null,
  };
}

export async function submitProQuote(
  proId: string,
  requestId: string,
  input: QuoteFormInput,
  locale: string,
) {
  return withDb((db) => {
    const request = db.requests.find(
      (entry) =>
        entry.id === requestId &&
        isOpenLead(entry) &&
        entry.matchedProIds.includes(proId),
    );
    if (!request) {
      throw new Error("Lead not found");
    }

    const existing = db.quotes.find(
      (quote) => quote.requestId === requestId && quote.proId === proId,
    );
    if (existing) {
      Object.assign(existing, input, { status: "sent", updatedAt: nowIso() });
      return existing;
    }

    const quote: Quote = {
      id: createId("quote"),
      requestId,
      proId,
      status: "sent",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      ...input,
    };

    db.quotes.push(quote);
    if (canTransitionRequestStatus(request.status, "quoted")) {
      request.status = "quoted";
    } else if (
      request.status === "awaiting_quotes" ||
      request.status === "submitted"
    ) {
      request.status = "quoted";
    }
    request.updatedAt = nowIso();

    db.notifications.push({
      id: createId("notif"),
      userId: request.customerId,
      title: textForLocale(locale, "New quote received", "收到新報價"),
      body: textForLocale(
        locale,
        `${findProProfile(db.proProfiles, proId).displayName} submitted a quote.`,
        `${findProProfile(db.proProfiles, proId).displayName} 已提交報價。`,
      ),
      read: false,
      createdAt: nowIso(),
    });

    return quote;
  });
}

export async function listProJobs(proId: string) {
  return listMongoProJobs(proId);
}

export async function getProJobDetail(proId: string, bookingId: string) {
  const db = await readDb();
  const booking = db.bookings.find(
    (entry) => entry.id === bookingId && entry.proId === proId,
  );
  if (!booking) {
    return null;
  }

  return hydrateBooking(
    booking,
    db.requests,
    db.users,
    db.quotes,
    db.bookingStatusEvents,
  );
}

export async function listProCalendarBookings(proId: string) {
  return listMongoProCalendarBookings(proId);
}

export async function getProEarningsSummary(proId: string) {
  const db = await readDb();
  const jobs = db.bookings.filter((booking) => booking.proId === proId);
  const quotes = db.quotes.filter((quote) => quote.proId === proId);
  const enrichedJobs = jobs.map((booking) =>
    hydrateBooking(
      booking,
      db.requests,
      db.users,
      db.quotes,
      db.bookingStatusEvents,
    ),
  );

  return {
    totals: {
      lifetimeQuoted: quotes.reduce((sum, quote) => sum + quote.total, 0),
      confirmedValue: enrichedJobs
        .filter((job) =>
          ["accepted", "scheduled", "in_progress", "completed"].includes(
            job.status,
          ),
        )
        .reduce((sum, job) => sum + (job.quote?.total ?? 0), 0),
      completedValue: enrichedJobs
        .filter((job) => job.status === "completed")
        .reduce((sum, job) => sum + (job.quote?.total ?? 0), 0),
      activeJobs: enrichedJobs.filter((job) =>
        ["accepted", "scheduled", "in_progress"].includes(job.status),
      ).length,
    },
    recentJobs: enrichedJobs
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 6),
  };
}

export async function updateProBookingStatus(
  proId: string,
  bookingId: string,
  status: BookingStatus,
  locale: string,
) {
  return withDb((db) => {
    const booking = db.bookings.find(
      (entry) => entry.id === bookingId && entry.proId === proId,
    );
    if (!booking) {
      throw new Error("Booking not found");
    }

    if (
      !canTransitionBookingStatus(booking.status, status) &&
      booking.status !== status
    ) {
      throw new Error("Invalid transition");
    }

    booking.status = status;
    booking.updatedAt = nowIso();

    const request = db.requests.find((entry) => entry.id === booking.requestId);
    if (request) {
      request.status =
        status === "accepted"
          ? "accepted"
          : status === "scheduled"
            ? "scheduled"
            : status === "in_progress"
              ? "in_progress"
              : status === "completed"
                ? "completed"
                : "cancelled";
      request.updatedAt = nowIso();
    }

    const eventId = createId("book_event");
    db.bookingStatusEvents.push({
      id: eventId,
      bookingId,
      status,
      note: textForLocale(
        locale,
        `Updated to ${status}`,
        `狀態已更新為 ${formatStatusLabel(status, locale)}`,
      ),
      createdAt: nowIso(),
      createdByUserId: proId,
    });
    booking.statusEventIds.push(eventId);

    return booking;
  });
}

export async function getAdminOverview() {
  const db = await readDb();
  return {
    totals: {
      customers: db.users.filter((user) => user.role === "customer").length,
      pros: db.users.filter((user) => user.role === "pro").length,
      requests: db.requests.length,
      quotes: db.quotes.length,
    },
    recentRequests: db.requests
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 8)
      .map((request) =>
        hydrateRequest(
          request,
          db.categories,
          db.users,
          db.quotes,
          db.bookings,
        ),
      ),
  };
}

export async function listAdminCustomers() {
  const db = await readDb();
  return db.users
    .filter((user) => user.role === "customer")
    .map((user) => ({
      ...user,
      requests: db.requests.filter((request) => request.customerId === user.id)
        .length,
      activeBookings: db.bookings.filter(
        (booking) =>
          booking.customerId === user.id &&
          ["accepted", "scheduled", "in_progress"].includes(booking.status),
      ).length,
    }));
}

export async function listAdminPros() {
  const db = await readDb();
  return db.users
    .filter((user) => user.role === "pro")
    .map((user) => ({
      ...user,
      profile:
        db.proProfiles.find((profile) => profile.userId === user.id) ?? null,
      quotesSent: db.quotes.filter((quote) => quote.proId === user.id).length,
      activeJobs: db.bookings.filter(
        (booking) =>
          booking.proId === user.id &&
          ["accepted", "scheduled", "in_progress"].includes(booking.status),
      ).length,
    }));
}

export async function listAdminRequests(status?: RequestStatus | "all") {
  const db = await readDb();
  return db.requests
    .filter(
      (request) => !status || status === "all" || request.status === status,
    )
    .map((request) =>
      hydrateRequest(request, db.categories, db.users, db.quotes, db.bookings),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listAdminQuotes() {
  const db = await readDb();
  return db.quotes
    .map((quote) => ({
      ...quote,
      pro: db.users.find((user) => user.id === quote.proId) ?? null,
      request:
        db.requests.find((request) => request.id === quote.requestId) ?? null,
      booking:
        db.bookings.find((booking) => booking.quoteId === quote.id) ?? null,
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listAdminCalendarBookings() {
  const db = await readDb();
  return db.bookings
    .filter((booking) => booking.status !== "cancelled")
    .map((booking) =>
      hydrateBooking(
        booking,
        db.requests,
        db.users,
        db.quotes,
        db.bookingStatusEvents,
      ),
    )
    .sort((a, b) =>
      (a.scheduledDate ?? a.updatedAt).localeCompare(
        b.scheduledDate ?? b.updatedAt,
      ),
    );
}

export async function getAdminRequestDetail(requestId: string) {
  const db = await readDb();
  const request = db.requests.find((entry) => entry.id === requestId);
  if (!request) {
    return null;
  }

  return {
    ...hydrateRequest(request, db.categories, db.users, db.quotes, db.bookings),
    adminNotes: db.adminNotes.filter(
      (note) =>
        note.entityId === request.id || note.entityId === request.customerId,
    ),
  };
}

export async function getAdminCustomerDetail(customerId: string) {
  const db = await readDb();
  const customer = db.users.find(
    (entry) => entry.id === customerId && entry.role === "customer",
  );
  if (!customer) {
    return null;
  }

  return {
    customer,
    profile:
      db.customerProfiles.find((profile) => profile.userId === customerId) ??
      null,
    requests: db.requests
      .filter((request) => request.customerId === customerId)
      .map((request) =>
        hydrateRequest(
          request,
          db.categories,
          db.users,
          db.quotes,
          db.bookings,
        ),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    notifications: db.notifications
      .filter((item) => item.userId === customerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    adminNotes: db.adminNotes.filter((note) => note.entityId === customerId),
  };
}

export async function getAdminProDetail(proId: string) {
  const db = await readDb();
  const pro = db.users.find(
    (entry) => entry.id === proId && entry.role === "pro",
  );
  if (!pro) {
    return null;
  }

  return {
    pro,
    profile: db.proProfiles.find((profile) => profile.userId === proId) ?? null,
    quotes: db.quotes
      .filter((quote) => quote.proId === proId)
      .map((quote) => ({
        ...quote,
        request:
          db.requests.find((request) => request.id === quote.requestId) ?? null,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    jobs: db.bookings
      .filter((booking) => booking.proId === proId)
      .map((booking) =>
        hydrateBooking(
          booking,
          db.requests,
          db.users,
          db.quotes,
          db.bookingStatusEvents,
        ),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    notifications: db.notifications
      .filter((item) => item.userId === proId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    adminNotes: db.adminNotes.filter((note) => note.entityId === proId),
  };
}

export async function getAdminQuoteDetail(quoteId: string) {
  const db = await readDb();
  const quote = db.quotes.find((entry) => entry.id === quoteId);
  if (!quote) {
    return null;
  }

  const request =
    db.requests.find((entry) => entry.id === quote.requestId) ?? null;

  return {
    ...quote,
    pro: db.users.find((user) => user.id === quote.proId) ?? null,
    request: request
      ? hydrateRequest(request, db.categories, db.users, db.quotes, db.bookings)
      : null,
    booking:
      db.bookings.find((booking) => booking.quoteId === quote.id) ?? null,
    adminNotes: db.adminNotes.filter((note) => note.entityId === quote.id),
  };
}

export async function updateAdminRequestStatus(
  requestId: string,
  status: RequestStatus,
  adminId: string,
  note?: string,
  locale = "zh-HK",
) {
  return withDb((db) => {
    const request = db.requests.find((entry) => entry.id === requestId);
    if (!request) {
      throw new Error("Request not found");
    }

    if (
      !canTransitionRequestStatus(request.status, status) &&
      request.status !== status
    ) {
      throw new Error("Invalid request transition");
    }

    request.status = status;
    request.updatedAt = nowIso();

    const booking = db.bookings.find((entry) => entry.requestId === requestId);
    const nextBookingStatus = mapRequestStatusToBookingStatus(status);

    if (!booking && nextBookingStatus) {
      throw new Error(
        "This request has no booking yet. Accept a quote before moving it into booking states.",
      );
    }

    if (booking && nextBookingStatus) {
      booking.status = nextBookingStatus;
      booking.updatedAt = nowIso();

      const eventId = createId("book_event");
      db.bookingStatusEvents.push({
        id: eventId,
        bookingId: booking.id,
        status: nextBookingStatus,
        note:
          note ||
          textForLocale(
            locale,
            `Ops updated booking to ${nextBookingStatus}`,
            `營運已將訂單狀態更新為 ${formatStatusLabel(nextBookingStatus, locale)}`,
          ),
        createdAt: nowIso(),
        createdByUserId: adminId,
      });
      booking.statusEventIds.push(eventId);
    }

    if (note) {
      const adminNote: AdminNote = {
        id: createId("admin_note"),
        entityType: "request",
        entityId: requestId,
        body: note,
        createdAt: nowIso(),
        createdByUserId: adminId,
      };

      db.adminNotes.push(adminNote);
    }

    const notifyUserIds = [
      request.customerId,
      ...(booking ? [booking.proId] : []),
    ];
    notifyUserIds.forEach((userId) => {
      db.notifications.push({
        id: createId("notif"),
        userId,
        title: textForLocale(
          locale,
          "Request status updated",
          "服務請求狀態已更新",
        ),
        body: textForLocale(
          locale,
          `${request.title} -> ${status}`,
          `${request.title} -> ${formatStatusLabel(status, locale)}`,
        ),
        read: false,
        createdAt: nowIso(),
      });
    });

    return request;
  });
}

export async function toggleProVerification(userId: string, verified: boolean) {
  return withDb((db) => {
    const profile = findProProfile(db.proProfiles, userId);
    profile.verificationStatus = verified ? "verified" : "unverified";
    profile.verificationLevel = verified ? "enhanced" : "none";
    return profile;
  });
}

export async function listCategoryOptions(locale: Locale) {
  return listMongoCategoryOptions(locale);
}
