import {
  ArrowLeft,
  ExternalLink,
  MapPin,
  MessageCircle,
  Phone,
} from "lucide-react";
import { PortalShell } from "@/components/shared/portal-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import type { FacebookGroupSnapshot } from "@/lib/facebook-group-snapshots";
import { getProNav } from "@/lib/nav";
import { extractWorkContactPhones } from "@/lib/work-contact-phones";

export function WorkLeadDetail({
  lead,
  locale,
  categoryLabel,
}: {
  lead: FacebookGroupSnapshot;
  locale: string;
  categoryLabel?: string;
}) {
  const en = locale === "en";
  const phones = extractWorkContactPhones(lead.contactText);
  return (
    <PortalShell
      locale={locale}
      title={en ? "Work opportunity details" : "工作機會詳情"}
      subtitle={lead.title}
      navItems={getProNav(locale, "leads")}
    >
      <Link
        href="/pro/leads"
        locale={locale}
        className="mb-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        {en ? "Back to work opportunities" : "返回工作機會"}
      </Link>
      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <Card>
          <CardContent className="space-y-4 p-4 sm:p-6">
            <h2 className="font-display text-xl font-bold sm:text-2xl">
              {lead.title || (en ? "Work opportunity" : "工作機會")}
            </h2>
            <div className="flex flex-wrap gap-2 text-xs font-semibold text-foreground/68">
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-tint px-2.5 py-1.5">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                {lead.location || (en ? "Hong Kong" : "香港")}
              </span>
              {categoryLabel ? (
                <span className="rounded-full bg-surface-tint px-2.5 py-1.5">
                  {categoryLabel}
                </span>
              ) : null}
            </div>
            <p className="whitespace-pre-wrap break-words text-sm leading-7">
              {lead.message}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-4 p-4 sm:p-6">
            <h2 className="font-display text-xl font-bold">
              {en ? "Contact" : "聯絡方式"}
            </h2>
            {phones.length ? (
              phones.map((contact) => (
                <div key={contact.phone} className="space-y-2">
                  <a
                    href={`tel:${contact.phone}`}
                    className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-4 font-bold !text-white"
                  >
                    <Phone className="h-4 w-4" />
                    {en ? "Call" : "致電"} {contact.label}
                  </a>
                  {contact.whatsapp ? (
                    <a
                      href={`https://wa.me/${contact.phone.replace(/^\+/, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-primary px-4 font-bold text-primary"
                    >
                      <MessageCircle className="h-4 w-4" />
                      WhatsApp {contact.label}
                    </a>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-sm leading-7 text-muted">
                {en
                  ? "No phone number is listed. Open the post to contact the poster."
                  : "帖文未提供電話，可到原帖聯絡發帖人。"}
              </p>
            )}
            <a
              href={lead.permalink ?? lead.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"
            >
              {lead.permalink
                ? en
                  ? "View post"
                  : "查看原帖"
                : en
                  ? "Open discussion"
                  : "前往討論區"}
              <ExternalLink className="h-4 w-4" />
            </a>
          </CardContent>
        </Card>
      </div>
    </PortalShell>
  );
}
