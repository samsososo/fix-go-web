import { MessageSquareText, ShieldCheck } from "lucide-react";
import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { Card, CardContent } from "@/components/ui/card";
import { SmsVerificationForm } from "@/features/auth/sms-verification-form";
import { Link } from "@/i18n/navigation";
import { getPendingSmsVerification } from "@/lib/sms-verification";

export default async function VerifyPage() {
  const locale = await getLocale();
  const pending = await getPendingSmsVerification();
  if (!pending) {
    redirect("/auth/login");
  }
  const now = Date.now();
  const initialResendSeconds = Math.max(
    0,
    Math.ceil((Date.parse(pending.resendAvailableAt) - now) / 1000),
  );
  const initialExpirySeconds = Math.max(
    0,
    Math.ceil((Date.parse(pending.codeExpiresAt) - now) / 1000),
  );

  return (
    <div className="content-wrap py-8 sm:py-12">
      <Card className="mx-auto max-w-lg overflow-hidden">
        <CardContent className="space-y-6 p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary">
              <ShieldCheck aria-hidden="true" className="h-6 w-6" />
            </span>
            <div>
              <p className="text-sm font-semibold text-primary">
                {locale === "en" ? "Phone verification" : "電話驗證"}
              </p>
              <h1 className="mt-1 font-display text-3xl font-extrabold">
                {locale === "en" ? "Enter your SMS code" : "輸入 SMS 驗證碼"}
              </h1>
            </div>
          </div>

          <p className="text-sm leading-7 text-muted">
            {locale === "en"
              ? `We sent a 6-digit code to ${pending.maskedPhone}. Enter it below to finish creating your account.`
              : `我哋已將 6 位數字驗證碼發送去 ${pending.maskedPhone}。輸入驗證碼完成帳戶登記。`}
          </p>

          {pending.consolePocCode ? (
            <div className="flex gap-3 rounded-2xl border border-secondary/30 bg-secondary/10 p-4">
              <MessageSquareText
                aria-hidden="true"
                className="mt-0.5 h-5 w-5 shrink-0 text-secondary-foreground"
              />
              <div className="text-sm leading-6">
                <p className="font-semibold">Development POC</p>
                <p className="text-muted">
                  {locale === "en" ? "Use test code" : "請使用測試碼"}{" "}
                  <strong className="font-mono text-foreground">
                    {pending.consolePocCode}
                  </strong>
                </p>
              </div>
            </div>
          ) : null}

          <SmsVerificationForm
            locale={locale}
            initialResendSeconds={initialResendSeconds}
            initialExpirySeconds={initialExpirySeconds}
          />

          <p className="border-t border-line/70 pt-5 text-center text-sm text-muted">
            <Link
              href="/auth/login"
              locale={locale}
              className="font-semibold text-primary"
            >
              {locale === "en" ? "Back to login" : "返回登入"}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
