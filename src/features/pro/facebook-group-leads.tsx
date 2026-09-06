import { MapPin } from "lucide-react";
import { WorkOpportunityCard } from "@/components/shared/work-opportunity-card";
import type { FacebookGroupSnapshot } from "@/lib/facebook-group-snapshots";

export function FacebookGroupLeads({
  leads,
  locale,
  categoryOptions,
}: {
  leads: FacebookGroupSnapshot[];
  locale: string;
  categoryOptions: { id: string; label: string }[];
}) {
  const en = locale === "en";
  return (
    <>
      {leads.map((lead) => (
        <a
          key={lead.id}
          href={lead.permalink ?? lead.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block"
        >
          <WorkOpportunityCard
            title={lead.title || (en ? "Work opportunity" : "工作機會")}
            description={lead.message}
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
            action={en ? "View details" : "查看詳情"}
          />
        </a>
      ))}
    </>
  );
}
