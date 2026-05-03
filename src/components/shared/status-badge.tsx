import { Badge } from "@/components/ui/badge";
import { formatStatusLabel } from "@/lib/formatters";
import {
  BookingStatus,
  QuoteStatus,
  RequestStatus,
  VerificationStatus,
} from "@/types/domain";

export function StatusBadge({
  status,
  locale,
}: {
  status: RequestStatus | QuoteStatus | BookingStatus | VerificationStatus;
  locale?: string;
}) {
  const variant =
    status === "completed" || status === "accepted" || status === "verified"
      ? "success"
      : status === "cancelled" || status === "rejected"
        ? "danger"
        : status === "quoted" || status === "scheduled"
          ? "warning"
          : "neutral";

  const label = locale
    ? formatStatusLabel(status, locale)
    : status.replaceAll("_", " ");

  return <Badge variant={variant}>{label}</Badge>;
}
