import { getLocale } from "next-intl/server";

import { PortalShell } from "@/components/shared/portal-shell";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { formatDistrictName } from "@/lib/hk-locale";
import { getProDashboard, listRelevantLeads } from "@/lib/mock/repositories";
import { getProNav } from "@/lib/nav";

export default async function ProDashboardPage() {
  const locale = await getLocale();
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const [dashboard, leads] = await Promise.all([
    getProDashboard(user.id),
    listRelevantLeads(user.id),
  ]);

  return (
    <PortalShell
      locale={locale}
      title={locale === "en" ? "Pro dashboard" : "師傅中心"}
      subtitle={
        locale === "en"
          ? "Complete your profile, watch matched leads and convert quotes into jobs."
          : "完善檔案、查看配對工作機會，並把報價轉化成訂單。"
      }
      navItems={getProNav(locale, "dashboard")}
    >
      <div className="grid gap-5 lg:grid-cols-4">
        <StatCard
          label={locale === "en" ? "Profile completion" : "檔案完整度"}
          value={`${dashboard.profileCompletion}%`}
          hint={locale === "en" ? "Basic trust signal" : "影響信任感"}
        />
        <StatCard
          label={locale === "en" ? "New leads" : "新工作機會"}
          value={dashboard.stats.newLeads}
          hint={
            locale === "en"
              ? "Matched by category and district"
              : "按工種及地區配對"
          }
        />
        <StatCard
          label={locale === "en" ? "Quotes sent" : "已送出報價"}
          value={dashboard.stats.quotesSent}
          hint={locale === "en" ? "Structured quote pipeline" : "結構化報價"}
        />
        <StatCard
          label={locale === "en" ? "Accepted jobs" : "已接受訂單"}
          value={dashboard.stats.acceptedJobs}
          hint={locale === "en" ? "Live work in progress" : "可持續跟進"}
        />
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardContent className="space-y-4">
            <h2 className="font-display text-2xl font-bold">
              {locale === "en" ? "Relevant leads" : "相關工作機會"}
            </h2>
            <div className="space-y-3">
              {leads.map((lead) => (
                <a
                  key={lead.id}
                  href={`/${locale}/pro/leads/${lead.id}`}
                  className="block rounded-2xl border border-line bg-white p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">{lead.title}</p>
                      <p className="text-sm text-muted">
                        {formatDistrictName(lead.address.district, locale)} ·{" "}
                        {lead.customer.fullName}
                      </p>
                    </div>
                    <StatusBadge status={lead.status} locale={locale} />
                  </div>
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-4">
            <h2 className="font-display text-2xl font-bold">
              {locale === "en" ? "Recent activity" : "最近動態"}
            </h2>
            <div className="space-y-3">
              {dashboard.activity.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-line bg-white p-4"
                >
                  <p className="font-semibold">{item.title}</p>
                  <p className="text-sm text-muted">{item.body}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </PortalShell>
  );
}
