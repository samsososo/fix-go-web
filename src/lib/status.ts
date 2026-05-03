import { BookingStatus, QuoteStatus, RequestStatus } from "@/types/domain";

export const requestStatusTransitions: Record<RequestStatus, RequestStatus[]> =
  {
    draft: ["submitted"],
    submitted: ["awaiting_quotes", "cancelled"],
    awaiting_quotes: ["quoted", "cancelled"],
    quoted: ["accepted", "cancelled"],
    accepted: ["scheduled", "cancelled"],
    scheduled: ["in_progress", "cancelled"],
    in_progress: ["completed", "cancelled"],
    completed: [],
    cancelled: [],
  };

export const bookingStatusTransitions: Record<BookingStatus, BookingStatus[]> =
  {
    quote_sent: ["accepted", "cancelled"],
    accepted: ["scheduled", "cancelled"],
    scheduled: ["in_progress", "cancelled"],
    in_progress: ["completed", "cancelled"],
    completed: [],
    cancelled: [],
  };

export const quoteStatusTransitions: Record<QuoteStatus, QuoteStatus[]> = {
  draft: ["sent"],
  sent: ["accepted", "rejected", "expired"],
  accepted: [],
  rejected: [],
  expired: [],
};

export function canTransitionRequestStatus(
  current: RequestStatus,
  next: RequestStatus,
) {
  return requestStatusTransitions[current].includes(next);
}

export function canTransitionBookingStatus(
  current: BookingStatus,
  next: BookingStatus,
) {
  return bookingStatusTransitions[current].includes(next);
}
