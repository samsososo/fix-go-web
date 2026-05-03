import { getLocale } from "next-intl/server";

import { EmptyState } from "@/components/shared/empty-state";
import { PortalShell } from "@/components/shared/portal-shell";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/formatters";
import { listCustomerMessages } from "@/lib/mock/repositories";
import { getCustomerNav } from "@/lib/nav";

export default async function CustomerMessagesPage() {
  const locale = await getLocale();
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const messages = await listCustomerMessages(user.id);

  return (
    <PortalShell
      locale={locale}
      title={locale === "en" ? "Message centre" : "訊息中心"}
      subtitle={
        locale === "en"
          ? "Booking updates and system notifications are collected here."
          : "訂單更新及系統通知會集中顯示於此。"
      }
      navItems={getCustomerNav(locale, "messages")}
    >
      {messages.length ? (
        <div className="grid gap-4">
          {messages.map((message) => (
            <Card key={message.id}>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="font-semibold">{message.title}</h2>
                  <span className="text-xs text-muted">
                    {formatDateTime(message.createdAt, locale)}
                  </span>
                </div>
                <p className="text-sm text-muted">{message.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          locale={locale}
          title={locale === "en" ? "No updates yet" : "暫未有最新通知"}
          description={
            locale === "en"
              ? "Quote alerts, acceptance updates, and booking changes will appear here as your requests progress."
              : "當你的請求收到報價、被接受或更新訂單狀態時，通知會顯示於此。"
          }
        />
      )}
    </PortalShell>
  );
}
