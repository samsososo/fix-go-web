import {
  AlertTriangle,
  CalendarClock,
  CreditCard,
  ShieldAlert,
} from "lucide-react";

import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { formatDateTime } from "@/lib/formatters";
import type { ProSubscriptionEntitlementSnapshot } from "@/lib/pro-subscription-entitlement";
import { cn } from "@/lib/utils";

export function SubscriptionAccessNotice({
  locale,
  snapshot,
  className,
}: {
  locale: string;
  snapshot: ProSubscriptionEntitlementSnapshot;
  className?: string;
}) {
  const isEnglish = locale === "en";
  const { entitlement, policyDataValid } = snapshot;
  const status = entitlement.status;

  if (policyDataValid && (status === "active" || status === "trialing")) {
    return null;
  }

  const copy = !policyDataValid
    ? {
        title: isEnglish
          ? "New work is temporarily paused"
          : "新工作功能暫時停用",
        description: isEnglish
          ? "We could not safely confirm your subscription status. You can still manage existing jobs and billing while it is being checked."
          : "系統暫時未能安全確認訂閱狀態；期間你仍可處理現有工作同管理月費。",
        icon: <ShieldAlert className="h-5 w-5" aria-hidden="true" />,
        tone: "danger" as const,
      }
    : status === "setup_required"
      ? {
          title: isEnglish
            ? "Set up your card to start taking new work"
            : "綁定付款卡後即可開始接新工作",
          description: isEnglish
            ? "Existing records remain available. Your three-calendar-month free trial starts only after Stripe confirms your card."
            : "你仍可查看現有紀錄；Stripe 確認綁卡後，3 個日曆月免費試用先會開始。",
          icon: <CreditCard className="h-5 w-5" aria-hidden="true" />,
          tone: "warning" as const,
        }
      : status === "grace_period"
        ? {
            title: isEnglish ? "Payment update needed" : "請更新付款資料",
            description: isEnglish
              ? `New-work access remains available until ${formatDateTime(entitlement.effectiveUntil, locale)}. Update your card before the deadline.`
              : `新工作功能會保留至 ${formatDateTime(entitlement.effectiveUntil, locale)}；請喺限期前更新付款卡。`,
            icon: <AlertTriangle className="h-5 w-5" aria-hidden="true" />,
            tone: "warning" as const,
          }
        : status === "cancel_at_period_end"
          ? {
              title: isEnglish ? "Cancellation scheduled" : "訂閱已安排取消",
              description: isEnglish
                ? `Your current access remains available until ${formatDateTime(entitlement.effectiveUntil, locale)}.`
                : `現有功能可繼續使用至 ${formatDateTime(entitlement.effectiveUntil, locale)}。`,
              icon: <CalendarClock className="h-5 w-5" aria-hidden="true" />,
              tone: "info" as const,
            }
          : {
              title:
                status === "terminated"
                  ? isEnglish
                    ? "Your subscription has ended"
                    : "訂閱已經結束"
                  : isEnglish
                    ? "New quotes and new jobs are paused"
                    : "新報價同新工作已暫停",
              description: isEnglish
                ? "You can still view records, manage existing jobs, update your profile, and fix billing."
                : "你仍可查看紀錄、處理現有工作、更新師傅檔案同管理月費。",
              icon: <ShieldAlert className="h-5 w-5" aria-hidden="true" />,
              tone: "danger" as const,
            };

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-2xl border px-4 py-4 sm:flex-row sm:items-center sm:justify-between",
        copy.tone === "danger"
          ? "border-danger/25 bg-danger/6"
          : copy.tone === "warning"
            ? "border-warning/25 bg-warning/8"
            : "border-primary/20 bg-surface-tint",
        className,
      )}
      role={copy.tone === "danger" ? "alert" : "status"}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={cn(
            "mt-0.5 shrink-0",
            copy.tone === "danger"
              ? "text-danger"
              : copy.tone === "warning"
                ? "text-warning"
                : "text-primary",
          )}
        >
          {copy.icon}
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-foreground">{copy.title}</p>
          <p className="mt-1 text-sm leading-6 text-muted">
            {copy.description}
          </p>
        </div>
      </div>
      <Link
        href="/pro/billing"
        locale={locale}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "shrink-0 bg-white/80",
        )}
      >
        <CreditCard className="h-4 w-4" aria-hidden="true" />
        {isEnglish ? "Manage billing" : "管理月費"}
      </Link>
    </div>
  );
}
