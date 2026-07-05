import type { Metadata } from "next";
import Image from "next/image";
import { getLocale } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { SignupForm } from "@/features/auth/signup-form";
import { listCategoryOptions } from "@/lib/mock/repositories";
import { createPageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as "zh-HK" | "en";
  return createPageMetadata(locale, "/auth/signup");
}

export default async function SignupPage() {
  const locale = await getLocale();
  const categoryOptions = await listCategoryOptions(locale as "zh-HK" | "en");
  const rolePoints =
    locale === "en"
      ? [
          "Customers submit repair requests and compare quotes.",
          "Pros choose specialties, review matching requests, and quote when ready.",
        ]
      : [
          "客戶可以提交維修需求，集中比較報價。",
          "師傅可選擇專長，查看合適需求，再決定是否報價。",
        ];

  return (
    <div className="content-wrap py-10">
      <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="overflow-hidden bg-white/74">
          <div className="relative aspect-[16/10] border-b border-line/70">
            <Image
              src="/images/customer-request-ai.png"
              alt={
                locale === "en"
                  ? "Customer preparing a home repair request"
                  : "客戶準備家居維修需求"
              }
              fill
              className="object-cover"
              sizes="(min-width: 1024px) 40vw, 100vw"
              priority={false}
            />
          </div>
          <CardContent className="space-y-5 p-8">
            <p className="text-sm font-semibold text-primary">
              {locale === "en" ? "Account setup" : "建立帳戶"}
            </p>
            <h1 className="font-display text-4xl font-extrabold">
              {locale === "en"
                ? "One account for the right workspace"
                : "一個帳戶，進入對應工作台"}
            </h1>
            <p className="text-sm leading-7 text-muted">
              {locale === "en"
                ? "Choose your role during signup. The platform routes each account to the customer or professional workflow."
                : "註冊時選擇身份，平台會把帳戶帶到客戶或師傅流程。"}
            </p>
            <div className="space-y-3 border-t border-line/70 pt-5">
              {rolePoints.map((point) => (
                <div key={point} className="flex gap-3 text-sm leading-6">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <span className="text-muted">{point}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-6">
            <div>
              <h2 className="font-display text-3xl font-bold">
                {locale === "en" ? "Sign up" : "註冊"}
              </h2>
              <p className="mt-2 text-sm text-muted">
                {locale === "en"
                  ? "Public signup is available for customer and professional roles."
                  : "公開註冊現時支援客戶與師傅身份。"}
              </p>
              <p className="mt-2 text-sm text-muted">
                <Link
                  href="/auth"
                  locale={locale}
                  className="font-semibold text-primary"
                >
                  {locale === "en" ? "View role overview" : "查看角色說明"}
                </Link>
              </p>
            </div>
            <SignupForm locale={locale} categoryOptions={categoryOptions} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
