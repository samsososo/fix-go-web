import { ArrowLeft, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

import { Card, CardContent } from "@/components/ui/card";
import { ForgotPasswordForm } from "@/features/auth/forgot-password-form";
import { Link } from "@/i18n/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();

  return {
    title:
      locale === "en" ? "Reset password | Hotfix" : "重設密碼 | Hotfix",
    robots: { index: false, follow: false },
  };
}

export default async function ForgotPasswordPage() {
  const locale = await getLocale();

  return (
    <div className="content-wrap py-10">
      <Card className="mx-auto max-w-xl">
        <CardContent className="space-y-7 p-8">
          <div className="space-y-4">
            <Link
              className="inline-flex items-center gap-2 text-sm font-semibold text-primary"
              href="/auth/login"
              locale={locale}
            >
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              {locale === "en" ? "Back to login" : "返回登入"}
            </Link>
            <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                <ShieldCheck aria-hidden="true" className="h-5 w-5" />
              </span>
              <div>
                <h1 className="font-display text-3xl font-bold">
                  {locale === "en" ? "Reset password" : "重設密碼"}
                </h1>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {locale === "en"
                    ? "Enter the same recovery details you used when creating the account."
                    : "請輸入建立帳戶時設定嘅電話、出生日期及保安問題資料。"}
                </p>
              </div>
            </div>
          </div>
          <ForgotPasswordForm locale={locale} />
        </CardContent>
      </Card>
    </div>
  );
}
