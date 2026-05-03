import { getLocale } from "next-intl/server";

import { EmptyState } from "@/components/shared/empty-state";
import { PortalShell } from "@/components/shared/portal-shell";
import { Card, CardContent } from "@/components/ui/card";
import { listAdminCustomers } from "@/lib/mock/repositories";
import { getAdminNav } from "@/lib/nav";

export default async function AdminCustomersPage() {
  const locale = await getLocale();
  const customers = await listAdminCustomers();

  return (
    <PortalShell
      locale={locale}
      title={locale === "en" ? "Customers" : "客戶"}
      subtitle={
        locale === "en"
          ? "Minimal customer list for support and ops review."
          : "供支援與營運查看的簡潔客戶清單。"
      }
      navItems={getAdminNav(locale, "customers")}
    >
      <Card>
        <CardContent className="overflow-x-auto">
          {customers.length ? (
            <table className="min-w-full text-left text-sm">
              <thead className="text-muted">
                <tr>
                  <th className="pb-3">{locale === "en" ? "Name" : "姓名"}</th>
                  <th className="pb-3">
                    {locale === "en" ? "Contact" : "聯絡資料"}
                  </th>
                  <th className="pb-3">
                    {locale === "en" ? "Requests" : "請求數量"}
                  </th>
                  <th className="pb-3">
                    {locale === "en" ? "Active bookings" : "進行中訂單"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id} className="border-t border-line">
                    <td className="py-3">
                      <a
                        href={`/${locale}/admin/customers/${customer.id}`}
                        className="font-medium text-primary"
                      >
                        {customer.fullName}
                      </a>
                    </td>
                    <td className="py-3">{customer.email ?? customer.phone}</td>
                    <td className="py-3">{customer.requests}</td>
                    <td className="py-3">{customer.activeBookings}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState
              locale={locale}
              title={locale === "en" ? "No customers yet" : "未有客戶"}
              description={
                locale === "en"
                  ? "New customer signups will appear here for support and ops review."
                  : "當有新客戶註冊後，資料會在此顯示，方便支援及營運檢視。"
              }
            />
          )}
        </CardContent>
      </Card>
    </PortalShell>
  );
}
