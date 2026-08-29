"use client";

import {
  CreditCard,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-hydrated";
import {
  setProSubscriptionAutoRenewalAction,
  startProOutstandingInvoicePaymentAction,
  startProPaymentMethodUpdateAction,
} from "@/lib/actions";

function ActionMessage({ value }: { value: string | null }) {
  return value ? (
    <p className="text-sm font-medium text-muted" role="status">
      {value}
    </p>
  ) : null;
}

export function PaymentMethodUpdateButton({ locale }: { locale: string }) {
  const isEnglish = locale === "en";
  const hydrated = useHydrated();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="w-full space-y-2 sm:w-auto">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full sm:w-auto"
        disabled={!hydrated || pending}
        onClick={() =>
          startTransition(async () => {
            setMessage(null);
            const result = await startProPaymentMethodUpdateAction({ locale });
            if (!result.ok) {
              setMessage(result.error);
              return;
            }
            window.location.assign(result.url);
          })
        }
      >
        {pending ? (
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <CreditCard className="h-4 w-4" aria-hidden="true" />
        )}
        {pending
          ? isEnglish
            ? "Opening Stripe…"
            : "正在開啟 Stripe…"
          : isEnglish
            ? "Update payment card"
            : "更新付款卡"}
      </Button>
      <ActionMessage value={message} />
    </div>
  );
}

export function RetryOutstandingPaymentButton({ locale }: { locale: string }) {
  const isEnglish = locale === "en";
  const hydrated = useHydrated();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="w-full space-y-2 sm:w-auto">
      <Button
        type="button"
        size="sm"
        className="w-full sm:w-auto"
        disabled={!hydrated || pending}
        onClick={() =>
          startTransition(async () => {
            setMessage(null);
            const result = await startProOutstandingInvoicePaymentAction({
              locale,
            });
            if (!result.ok) {
              setMessage(result.error);
              return;
            }
            window.location.assign(result.url);
          })
        }
      >
        {pending ? (
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        )}
        {pending
          ? isEnglish
            ? "Opening Stripe…"
            : "正在開啟 Stripe…"
          : isEnglish
            ? "Pay outstanding invoice"
            : "前往 Stripe 繳付欠款"}
      </Button>
      <ActionMessage value={message} />
    </div>
  );
}

export function SubscriptionRenewalButton({
  locale,
  cancelAtPeriodEnd,
}: {
  locale: string;
  cancelAtPeriodEnd: boolean;
}) {
  const isEnglish = locale === "en";
  const hydrated = useHydrated();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const submit = () => {
    if (
      !cancelAtPeriodEnd &&
      !window.confirm(
        isEnglish
          ? "Cancel at the end of the current period? Payments already collected are not prorated or refunded."
          : "確定喺目前週期完結時取消？已收取嘅當期月費不會按比例退款。",
      )
    ) {
      return;
    }
    startTransition(async () => {
      setMessage(null);
      const result = await setProSubscriptionAutoRenewalAction({
        locale,
        cancelAtPeriodEnd: !cancelAtPeriodEnd,
      });
      setMessage(result.ok ? result.message : result.error);
      if (result.ok) {
        router.refresh();
      }
    });
  };

  return (
    <div className="w-full space-y-2 sm:w-auto">
      <Button
        type="button"
        variant={cancelAtPeriodEnd ? "outline" : "ghost"}
        size="sm"
        className="w-full sm:w-auto"
        disabled={!hydrated || pending}
        onClick={submit}
      >
        {pending ? (
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : cancelAtPeriodEnd ? (
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
        ) : (
          <XCircle className="h-4 w-4" aria-hidden="true" />
        )}
        {pending
          ? isEnglish
            ? "Updating…"
            : "正在更新…"
          : cancelAtPeriodEnd
            ? isEnglish
              ? "Keep subscription"
              : "保留訂閱"
            : isEnglish
              ? "Cancel at period end"
              : "於期末取消訂閱"}
      </Button>
      <ActionMessage value={message} />
    </div>
  );
}
