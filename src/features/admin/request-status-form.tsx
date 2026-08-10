"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { updateAdminRequestStatusAction } from "@/lib/actions";
import { formatStatusLabel } from "@/lib/formatters";
import { useHydrated } from "@/hooks/use-hydrated";
import { requestStatusTransitions } from "@/lib/status";
import { RequestStatus } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function AdminRequestStatusForm({
  locale,
  requestId,
  currentStatus,
}: {
  locale: string;
  requestId: string;
  currentStatus: RequestStatus;
}) {
  const router = useRouter();
  const isHydrated = useHydrated();
  const [status, setStatus] = useState<RequestStatus>(currentStatus);
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const statusOptions = useMemo(
    () => [currentStatus, ...requestStatusTransitions[currentStatus]],
    [currentStatus],
  );

  return (
    <div className="space-y-3">
      <Select
        aria-label={locale === "en" ? "Request status" : "請求狀態"}
        disabled={!isHydrated || isPending}
        value={status}
        onChange={(event) => setStatus(event.target.value as RequestStatus)}
      >
        {statusOptions.map((entry) => (
          <option key={entry} value={entry}>
            {formatStatusLabel(entry, locale)}
          </option>
        ))}
      </Select>
      <Input
        aria-label={locale === "en" ? "Admin note" : "營運備註"}
        placeholder={locale === "en" ? "Optional admin note" : "可選營運備註"}
        value={note}
        disabled={!isHydrated || isPending}
        onChange={(event) => setNote(event.target.value)}
      />
      <Button
        size="sm"
        disabled={!isHydrated || isPending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await updateAdminRequestStatusAction({
              locale,
              requestId,
              status,
              note,
            });
            if (!result.ok) {
              setError(result.error ?? "Unable to update request.");
              return;
            }
            router.refresh();
          })
        }
      >
        {isPending ? "..." : locale === "en" ? "Apply" : "更新"}
      </Button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
