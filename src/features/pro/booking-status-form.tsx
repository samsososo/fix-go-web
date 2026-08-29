"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { updateBookingStatusAction } from "@/lib/actions";
import { formatStatusLabel } from "@/lib/formatters";
import { useHydrated } from "@/hooks/use-hydrated";
import { bookingStatusTransitions } from "@/lib/status";
import { BookingStatus } from "@/types/domain";
import { Button } from "@/components/ui/button";

export function BookingStatusForm({
  locale,
  bookingId,
  currentStatus,
}: {
  locale: string;
  bookingId: string;
  currentStatus: BookingStatus;
}) {
  const router = useRouter();
  const isHydrated = useHydrated();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const statusOptions = useMemo(
    () => bookingStatusTransitions[currentStatus],
    [currentStatus],
  );

  function updateStatus(status: BookingStatus) {
    if (
      status === "cancelled" &&
      !window.confirm(
        locale === "en"
          ? "Cancel this booking? The customer will see the updated status."
          : "確定取消呢張訂單？客戶會見到更新後嘅狀態。",
      )
    ) {
      return;
    }

    startTransition(async () => {
      setError(null);
      const result = await updateBookingStatusAction({
        locale,
        bookingId,
        status,
      });
      if (!result.ok) {
        setError(result.error ?? "Unable to update booking.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-surface-tint/72 px-4 py-3 text-sm">
        <span className="text-muted">
          {locale === "en" ? "Current status" : "目前狀態"}
        </span>
        <p className="mt-1 font-bold text-primary">
          {formatStatusLabel(currentStatus, locale)}
        </p>
      </div>
      {statusOptions.length ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {statusOptions.map((status) => (
            <Button
              key={status}
              type="button"
              variant={status === "cancelled" ? "danger" : "default"}
              size="sm"
              className="w-full"
              disabled={!isHydrated || isPending}
              onClick={() => updateStatus(status)}
            >
              {isPending
                ? "..."
                : status === "cancelled"
                  ? locale === "en"
                    ? "Cancel booking"
                    : "取消訂單"
                  : locale === "en"
                    ? `Mark ${formatStatusLabel(status, locale)}`
                    : `更新為${formatStatusLabel(status, locale)}`}
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-sm leading-6 text-muted">
          {locale === "en"
            ? "This booking has no further status actions."
            : "呢張訂單目前冇其他狀態操作。"}
        </p>
      )}
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
