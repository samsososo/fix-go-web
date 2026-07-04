import { getLocale } from "next-intl/server";

import { PortalShell } from "@/components/shared/portal-shell";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { getAdminNav } from "@/lib/nav";
import { listAdminRequests } from "@/lib/mock/repositories";

export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const locale = await getLocale();
  const { status } = await searchParams;
  const requests = await listAdminRequests((status as never) || "all");

  return (
    <PortalShell
      locale={locale}
      title={locale === "en" ? "Service requests" : "服務請求"}
      subtitle={
        locale === "en"
          ? "Filter by status or inspect records in detail."
          : "可按狀態篩選，並進一步查看詳情。"
      }
      navItems={getAdminNav(locale, "requests")}
    >
      <Card>
        <CardContent className="space-y-3">
          {requests.map((request) => (
            <a
              key={request.id}
              href={`/admin/requests/${request.id}`}
              className="block rounded-2xl border border-line bg-white p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{request.title}</p>
                  <p className="text-sm text-muted">
                    {request.customer?.fullName} ·{" "}
                    {request.category?.name[locale as "zh-HK" | "en"]}
                  </p>
                </div>
                <StatusBadge status={request.status} locale={locale} />
              </div>
            </a>
          ))}
        </CardContent>
      </Card>
    </PortalShell>
  );
}
