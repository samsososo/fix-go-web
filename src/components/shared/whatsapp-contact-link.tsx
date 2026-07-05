import { MessageCircle } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { formatHongKongPhone, formatWhatsAppUrl } from "@/lib/formatters";
import { cn } from "@/lib/utils";

export function WhatsAppContactLink({
  phone,
  locale,
  className,
}: {
  phone: string | undefined;
  locale: string;
  className?: string;
}) {
  const href = formatWhatsAppUrl(phone);
  if (!href || !phone) {
    return null;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        buttonVariants({ variant: "outline", size: "sm" }),
        "w-full text-primary sm:w-auto",
        className,
      )}
    >
      <MessageCircle className="size-4" aria-hidden="true" />
      {locale === "en"
        ? "WhatsApp customer"
        : `WhatsApp ${formatHongKongPhone(phone)}`}
    </a>
  );
}
