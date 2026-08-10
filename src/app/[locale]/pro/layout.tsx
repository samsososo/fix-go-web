import { SubscriptionAccessNotice } from "@/features/pro/subscription-access-notice";
import { requireRole } from "@/lib/auth";
import { getProSubscriptionEntitlement } from "@/lib/pro-subscription-entitlement";

export default async function ProLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await requireRole("pro", locale);
  const snapshot = await getProSubscriptionEntitlement(user.id);
  const showNotice =
    !snapshot.policyDataValid ||
    !["active", "trialing"].includes(snapshot.entitlement.status);

  return (
    <>
      {showNotice ? (
        <div className="content-wrap pt-6 sm:pt-8">
          <SubscriptionAccessNotice locale={locale} snapshot={snapshot} />
        </div>
      ) : null}
      {children}
    </>
  );
}
