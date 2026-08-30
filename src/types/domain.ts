export type Locale = "zh-HK" | "en";

export type LanguageCode = "zh-HK" | "en" | "yue";
export type UserRole = "customer" | "pro" | "admin";
export type VerificationStatus = "unverified" | "pending" | "verified";
export type VerificationLevel = "none" | "basic" | "enhanced";
export type RequestUrgency = "asap" | "today" | "tomorrow" | "scheduled";
export type RequestStatus =
  | "draft"
  | "submitted"
  | "awaiting_quotes"
  | "quoted"
  | "accepted"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled";
export type QuoteStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "rejected"
  | "expired";
export type BookingStatus =
  | "quote_sent"
  | "accepted"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface User {
  id: string;
  role: UserRole;
  fullName: string;
  email?: string;
  phone: string;
  locale: Locale;
  createdAt: string;
  lastLoginAt: string;
  phoneVerificationRequiredAt?: string;
  phoneVerifiedAt?: string;
}

export interface Address {
  id: string;
  district: string;
  area: string;
  buildingEstate: string;
  block?: string;
  floor?: string;
  flatRoom?: string;
  landmarkNotes?: string;
}

export interface CustomerProfile {
  userId: string;
  savedAddresses: Address[];
  preferredLanguage: LanguageCode;
}

export interface ProProfile {
  userId: string;
  displayName: string;
  yearsOfExperience: number;
  serviceCategoryIds: string[];
  serviceAreaDistricts: string[];
  languagesSpoken: LanguageCode[];
  introduction: string;
  emergencyAvailability: boolean;
  verificationStatus: VerificationStatus;
  verificationLevel: VerificationLevel;
  documentPlaceholders: string[];
  completedJobs: number;
  avgResponseHours: number;
}

export interface ServiceSubcategory {
  id: string;
  name: Record<Locale, string>;
}

export interface ServiceCategory {
  id: string;
  name: Record<Locale, string>;
  description: Record<Locale, string>;
  subcategories: ServiceSubcategory[];
}

export interface DistrictAreaSeed {
  district: string;
  areas: string[];
}

export interface Attachment {
  id: string;
  requestId: string;
  fileName: string;
  mimeType: string;
  uploadedAt: string;
}

export interface ServiceRequest {
  id: string;
  customerId: string;
  title: string;
  description: string;
  categoryId: string;
  subcategoryId: string;
  urgency: RequestUrgency;
  scheduledDate?: string;
  address: Address;
  accessNotes?: string;
  budgetMin?: number;
  budgetMax?: number;
  attachmentIds: string[];
  status: RequestStatus;
  matchedProIds: string[];
  acceptedQuoteId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Quote {
  id: string;
  requestId: string;
  proId: string;
  quoteAmount: number;
  labourEstimate: number;
  partsEstimate: number;
  callOutFee: number;
  total: number;
  includedWork: string;
  exclusions: string;
  earliestAvailability: string;
  estimatedDurationMinutes: number;
  noteToCustomer: string;
  status: QuoteStatus;
  createdAt: string;
  updatedAt: string;
}

export interface BookingStatusEvent {
  id: string;
  bookingId: string;
  status: BookingStatus;
  note: string;
  createdAt: string;
  createdByUserId: string;
}

export interface Booking {
  id: string;
  requestId: string;
  quoteId: string;
  customerId: string;
  proId: string;
  status: BookingStatus;
  scheduledDate?: string;
  estimatedDurationMinutes?: number;
  createdAt: string;
  updatedAt: string;
  statusEventIds: string[];
}

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export interface AdminNote {
  id: string;
  entityType: "customer" | "pro" | "request" | "quote" | "booking";
  entityId: string;
  body: string;
  createdAt: string;
  createdByUserId: string;
}

export interface SessionPayload {
  userId: string;
  role: UserRole;
}

export interface MockDb {
  users: User[];
  customerProfiles: CustomerProfile[];
  proProfiles: ProProfile[];
  categories: ServiceCategory[];
  districts: DistrictAreaSeed[];
  addresses: Address[];
  attachments: Attachment[];
  requests: ServiceRequest[];
  quotes: Quote[];
  bookings: Booking[];
  bookingStatusEvents: BookingStatusEvent[];
  notifications: NotificationItem[];
  adminNotes: AdminNote[];
}
