import { BrandLogo } from "@/components/shared/brand-logo";
import { cn } from "@/lib/utils";
import { type UserRole } from "@/types/domain";

export function SiteFooter({
  locale,
  userRole,
}: {
  locale: string;
  userRole?: UserRole;
}) {
  const hasMobileWorkspaceNav = userRole === "customer" || userRole === "pro";

  return (
    <footer
      className={cn(
        "mt-auto border-t border-white/70 bg-white/55 pt-10",
        hasMobileWorkspaceNav ? "pb-28 lg:pb-10" : "pb-10",
      )}
    >
      <div className="content-wrap flex flex-col gap-5 text-sm text-muted sm:flex-row sm:items-end sm:justify-between">
        <div>
          <BrandLogo className="h-12 max-w-[13rem]" />
          <p className="mt-2 max-w-xl leading-7">
            {locale === "en"
              ? "Hong Kong home repair quote platform for customers and service professionals."
              : "為客戶及師傅而設的香港家居維修報價平台。"}
          </p>
        </div>
        <a
          href="/images/services/ATTRIBUTION.txt"
          className="shrink-0 underline decoration-line underline-offset-4 transition hover:text-foreground"
        >
          {locale === "en" ? "Image credits" : "圖片來源"}
        </a>
      </div>
    </footer>
  );
}
