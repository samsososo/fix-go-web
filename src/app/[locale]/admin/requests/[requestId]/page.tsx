import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { PortalShell } from "@/components/shared/portal-shell";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { AdminRequestStatusForm } from "@/features/admin/request-status-form";
import { getCurrentUser } from "@/lib/auth";
import { formatStatusLabel } from "@/lib/formatters";
import { getAdminNav } from "@/lib/nav";
import { getAdminRequestDetail } from "@/lib/mock/repositories";
import { formatCurrency } from "@/lib/utils";

export default async function AdminRequestDetailPage({
  params,
}: {
  params: Promise<{ locale: string; requestId: string }>;
}) {
  const locale = await getLocale();
  const { requestId } = await params;
  const admin = await getCurrentUser();
  if (!admin) {
    return null;
  }

  const request = await getAdminRequestDetail(requestId);
  if (!request) {
    redirect(`/admin/requests`);
  }

  return (
    <PortalShell
      locale={locale}
      title={locale === "en" ? "Request detail" : "請求詳情"}
      subtitle={request.title}
      navItems={getAdminNav(locale, "requests")}
    >
      <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl font-bold">
                {request.title}
              </h2>
              <StatusBadge status={request.status} locale={locale} />
            </div>
            <p className="text-sm leading-7 text-muted">
              {request.description}
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-soft-accent/45 p-4 text-sm">
                <p className="font-semibold">
                  {locale === "en" ? "Customer" : "客戶"}
                </p>
                <p className="mt-2 text-muted">{request.customer?.fullName}</p>
              </div>
              <div className="rounded-2xl bg-soft-accent/45 p-4 text-sm">
                <p className="font-semibold">
                  {locale === "en" ? "Budget" : "預算"}
                </p>
                <p className="mt-2 text-muted">
                  {request.budgetMax
                    ? `${formatCurrency(request.budgetMin ?? 0, locale)} - ${formatCurrency(request.budgetMax, locale)}`
                    : "-"}
                </p>
              </div>
            </div>
            <div className="space-y-3">
              <p className="font-semibold">
                {locale === "en" ? "Quotes" : "報價"}
              </p>
              {request.quotes.map((quote) => (
                <div
                  key={quote.id}
                  className="rounded-2xl border border-line bg-white p-4 text-sm text-muted"
                >
                  {quote.id} · {formatStatusLabel(quote.status, locale)} ·{" "}
                  {formatCurrency(quote.total, locale)}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-5">
            <h2 className="font-display text-2xl font-bold">
              {locale === "en" ? "Ops controls" : "營運操作"}
            </h2>
            <AdminRequestStatusForm
              locale={locale}
              adminId={admin.id}
              requestId={request.id}
              currentStatus={request.status}
            />
            <div className="space-y-3">
              <p className="font-semibold">
                {locale === "en" ? "Admin notes" : "營運備註"}
              </p>
              {request.adminNotes.map((note) => (
                <div
                  key={note.id}
                  className="rounded-2xl border border-line bg-white p-4 text-sm text-muted"
                >
                  {note.body}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </PortalShell>
  );
}
