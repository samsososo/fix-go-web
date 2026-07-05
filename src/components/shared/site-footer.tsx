export function SiteFooter({ locale }: { locale: string }) {
  return (
    <footer className="mt-auto border-t border-white/70 bg-white/55 py-10">
      <div className="content-wrap text-sm text-muted">
        <div>
          <p className="font-display text-xl font-extrabold text-foreground">
            Hotfix
          </p>
          <p className="mt-2 max-w-xl leading-7">
            {locale === "en"
              ? "Hong Kong home repair quote platform for customers and service professionals."
            : "為客戶及師傅而設的香港家居維修報價平台。"}
          </p>
        </div>
      </div>
    </footer>
  );
}
