"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { updateBookingStatusAction } from "@/lib/actions";
import { formatStatusLabel } from "@/lib/formatters";
import { useHydrated } from "@/hooks/use-hydrated";
import { bookingStatusTransitions } from "@/lib/status";
import { BookingStatus } from "@/types/domain";
import { Select } from "@/components/ui/select";

export function BookingStatusForm({
  locale,
  proId,
  bookingId,
  currentStatus,
}: {
  locale: string;
  proId: string;
  bookingId: string;
  currentStatus: BookingStatus;
}) {
  const router = useRouter();
  const isHydrated = useHydrated();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const statusOptions = useMemo(
    () => [currentStatus, ...bookingStatusTransitions[currentStatus]],
    [currentStatus],
  );

  return (
    <div className="space-y-2">
      <Select
        aria-label={locale === "en" ? "Booking status" : "訂單狀態"}
        disabled={!isHydrated || isPending}
        defaultValue={currentStatus}
        onChange={(event) =>
          startTransition(async () => {
            setError(null);
            const result = await updateBookingStatusAction({
              locale,
              proId,
              bookingId,
              status: event.target.value as BookingStatus,
            });
            if (!result.ok) {
              setError(result.error ?? "Unable to update booking.");
              return;
            }
            router.refresh();
          })
        }
      >
        {statusOptions.map((status) => (
          <option key={status} value={status}>
            {formatStatusLabel(status, locale)}
          </option>
        ))}
      </Select>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
