import { MapPin } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { WorkOpportunityCard } from "@/components/shared/work-opportunity-card";
import type {
  FacebookGroupSnapshot,
  FacebookGroupSnapshotPreview,
} from "@/lib/facebook-group-snapshots";

export function FacebookGroupLeads({
  leads,
  locale,
  categoryOptions,
}: {
  leads: (FacebookGroupSnapshot | FacebookGroupSnapshotPreview)[];
  locale: string;
  categoryOptions: { id: string; label: string }[];
}) {
  const en = locale === "en";
  return (
    <>
      {leads.map((lead) => {
        const card = (
          <WorkOpportunityCard
            title={lead.title || (en ? "Work opportunity" : "工作機會")}
            locked={lead.locked}
            description={
              lead.locked
                ? en
                  ? "Set up your card to view the full job description and contact details."
                  : "綁定付款卡後即可查看完整工作描述及聯絡資料。"
                : lead.message
            }
            metadata={
              <>
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-tint px-2.5 py-1.5">
                  <MapPin className="h-3.5 w-3.5 text-primary" />
                  {lead.location || (en ? "Hong Kong" : "香港")}
                </span>
                {categoryOptions.find((c) => c.id === lead.categoryId) ? (
                  <span className="rounded-full bg-surface-tint px-2.5 py-1.5">
                    {
                      categoryOptions.find((c) => c.id === lead.categoryId)
                        ?.label
                    }
                  </span>
                ) : null}
              </>
            }
            action={
              lead.locked
                ? en
                  ? "Set up card to view details"
                  : "綁卡後查看詳情"
                : en
                  ? "View details"
                  : "查看詳情"
            }
          />
        );
        return lead.locked ? (
          <div key={lead.id} aria-disabled="true">
            {card}
          </div>
        ) : (
          <Link
            key={lead.id}
            href={`/pro/leads/work-${lead.id}`}
            locale={locale}
            className="block"
          >
            {card}
          </Link>
        );
      })}
    </>
  );
}
