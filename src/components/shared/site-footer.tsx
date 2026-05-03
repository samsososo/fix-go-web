export function SiteFooter({ locale }: { locale: string }) {
  return (
    <footer className="mt-auto border-t border-white/70 bg-white/55 py-10">
      <div className="content-wrap flex flex-col gap-4 text-sm text-muted lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-display text-xl font-extrabold text-foreground">
            Hotfix
          </p>
          <p className="mt-2 max-w-xl leading-7">
            {locale === "en"
              ? "Hong Kong home services platform for customers, service professionals, and operations teams."
              : "為客戶、師傅及營運團隊而設的香港家居服務平台。"}
          </p>
        </div>
        <div className="space-y-1 text-left lg:text-right">
          <p>
            {locale === "en"
              ? "Traditional Chinese default. English supported."
              : "預設繁體中文，並支援英文。"}
          </p>
          <p>
            {locale === "en"
              ? "Timezone: Asia/Hong_Kong. Structured Hong Kong addresses supported."
              : "時區：香港時間（UTC+8）。支援香港結構化地址。"}
          </p>
        </div>
      </div>
    </footer>
  );
}
