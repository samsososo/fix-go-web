import { getLocale } from "next-intl/server";

import { PortalShell } from "@/components/shared/portal-shell";
import { Card, CardContent } from "@/components/ui/card";
import { RequestForm } from "@/features/customer/request-form";
import { getCurrentUser } from "@/lib/auth";
import { listCategoryOptions, listDistricts } from "@/lib/mock/repositories";
import { getCustomerNav } from "@/lib/nav";

export default async function NewRequestPage() {
  const locale = await getLocale();
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const [categoryOptions, districts] = await Promise.all([
    listCategoryOptions(locale as "zh-HK" | "en"),
    listDistricts(),
  ]);

  return (
    <PortalShell
      locale={locale}
      title={locale === "en" ? "Create a service request" : "建立服務請求"}
      subtitle={
        locale === "en"
          ? "Describe the job clearly so professionals can quote accurately."
          : "盡量清楚描述工作內容，方便師傅提供更準確報價。"
      }
      navItems={getCustomerNav(locale, "new-request")}
    >
      <Card>
        <CardContent>
          <RequestForm
            locale={locale}
            customerPhone={user.phone}
            categoryOptions={categoryOptions}
            districts={districts}
          />
        </CardContent>
      </Card>
    </PortalShell>
  );
}
