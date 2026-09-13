import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { LoginForm } from "@/features/auth/login-form";
import { createPageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as "zh-HK" | "en";
  return createPageMetadata(locale, "/auth/login");
}

export default async function LoginPage() {
  const locale = await getLocale();
  const leftPanelPoints =
    locale === "en"
      ? [
          "Customers can compare repair quotes",
          "Professionals can find work and submit quotes",
          "Keep track of orders and scheduled visits",
        ]
      : [
          "客戶集中比較維修報價",
          "師傅搵合適工作、提交報價",
          "隨時查看訂單及上門安排",
        ];

  return (
    <div className="content-wrap py-10">
      <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[0.95fr_1.05fr]">
        <Card className="bg-[#142132] text-white">
          <CardContent className="space-y-4 p-8">
            <p className="text-sm font-semibold text-[#a8e2d4]">
              {locale === "en" ? "Account access" : "帳戶登入"}
            </p>
            <h1 className="font-display text-4xl font-extrabold">
              {locale === "en" ? "Welcome back to 快修24" : "歡迎返嚟快修24"}
            </h1>
            <p className="text-sm leading-7 text-white/75">
              {locale === "en"
                ? "Log in to manage your repair requests, quotes and orders, and check your upcoming visits."
                : "登入管理維修需求、報價及訂單，查看下一次上門安排。"}
            </p>
            <div className="space-y-3 pt-4">
              {leftPanelPoints.map((point) => (
                <div
                  key={point}
                  className="border-l border-white/20 py-2 pl-4 text-sm leading-6 text-white/78"
                >
                  {point}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-6">
            <div>
              <h2 className="font-display text-3xl font-bold">
                {locale === "en" ? "Log in" : "登入"}
              </h2>
              <p className="mt-2 text-sm text-muted">
                {locale === "en"
                  ? "Use your email or Hong Kong phone number together with your password."
                  : "請使用你的電郵或香港電話號碼配合密碼登入。"}
              </p>
              <p className="mt-2 text-sm text-muted">
                <Link
                  href="/auth"
                  locale={locale}
                  className="font-semibold text-primary"
                >
                  {locale === "en" ? "Log in or sign up" : "登入及註冊介紹"}
                </Link>
              </p>
            </div>
            <LoginForm locale={locale} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
