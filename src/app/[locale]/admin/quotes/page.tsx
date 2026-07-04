import { getLocale } from "next-intl/server";

import { EmptyState } from "@/components/shared/empty-state";
import { PortalShell } from "@/components/shared/portal-shell";
import { Card, CardContent } from "@/components/ui/card";
import { formatStatusLabel } from "@/lib/formatters";
import { getAdminNav } from "@/lib/nav";
import { listAdminQuotes } from "@/lib/mock/repositories";
import { formatCurrency } from "@/lib/utils";

export default async function AdminQuotesPage() {
  const locale = await getLocale();
  const quotes = await listAdminQuotes();

  return (
    <PortalShell
      locale={locale}
      title={locale === "en" ? "Quotes" : "報價"}
      subtitle={
        locale === "en"
          ? "Inspect supply-side response quality and totals."
          : "查看供應側回覆質素及報價總額。"
      }
      navItems={getAdminNav(locale, "quotes")}
    >
      <Card>
        <CardContent className="overflow-x-auto">
          {quotes.length ? (
            <table className="min-w-full text-left text-sm">
              <thead className="text-muted">
                <tr>
                  <th className="pb-3">{locale === "en" ? "Quote" : "報價"}</th>
                  <th className="pb-3">{locale === "en" ? "Pro" : "師傅"}</th>
                  <th className="pb-3">
                    {locale === "en" ? "Request" : "服務請求"}
                  </th>
                  <th className="pb-3">
                    {locale === "en" ? "Status" : "狀態"}
                  </th>
                  <th className="pb-3">{locale === "en" ? "Total" : "總額"}</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((quote) => (
                  <tr key={quote.id} className="border-t border-line">
                    <td className="py-3">
                      <a
                        href={`/admin/quotes/${quote.id}`}
                        className="font-medium text-primary"
                      >
                        {quote.id}
                      </a>
                    </td>
                    <td className="py-3">{quote.pro?.fullName}</td>
                    <td className="py-3">{quote.request?.title}</td>
                    <td className="py-3">
                      {formatStatusLabel(quote.status, locale)}
                    </td>
                    <td className="py-3">
                      {formatCurrency(quote.total, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState
              locale={locale}
              title={locale === "en" ? "No quotes yet" : "未有報價"}
              description={
                locale === "en"
                  ? "Quotes sent by professionals will be listed here for quality and ops review."
                  : "師傅提交的報價會在此顯示，方便營運檢查與品質管理。"
              }
            />
          )}
        </CardContent>
      </Card>
    </PortalShell>
  );
}
