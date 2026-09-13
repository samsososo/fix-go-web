import { ArrowRight, BriefcaseBusiness, House } from "lucide-react";
import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createPageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as "zh-HK" | "en";
  return createPageMetadata(locale, "/auth");
}

export default async function AuthHubPage() {
  const locale = await getLocale();

  const roles =
    locale === "en"
      ? [
          {
            icon: House,
            title: "Customer",
            body: "Describe your repair, compare prices and availability, then choose a professional and track your order.",
          },
          {
            icon: BriefcaseBusiness,
            title: "Professional",
            body: "Review open service requests, filter by category, send quotes, and update job progress.",
          },
        ]
      : [
          {
            icon: House,
            title: "客戶",
            body: "提交維修需求，比較價錢及上門時間，揀選合適師傅並追蹤訂單進度。",
          },
          {
            icon: BriefcaseBusiness,
            title: "師傅",
            body: "查看所有開放服務需求、按分類篩選、提交報價，並更新服務進度。",
          },
        ];

  return (
    <div className="content-wrap py-10">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="bg-surface-strong text-white">
          <CardContent className="space-y-6 p-8">
            <p className="text-sm font-semibold text-[#a8e2d4]">
              {locale === "en" ? "Log in or sign up" : "登入或註冊"}
            </p>
            <div className="space-y-4">
              <h1 className="font-display text-4xl font-extrabold tracking-tight">
                {locale === "en"
                  ? "Find a professional. Find your next job."
                  : "搵師傅，搵工作，都喺快修24"}
              </h1>
              <p className="text-sm leading-7 text-white/72">
                {locale === "en"
                  ? "Log in to manage repair requests, quotes and orders. New here? Choose customer or professional when you sign up."
                  : "登入管理維修需求、報價及訂單。第一次使用？註冊時選擇客戶或師傅身份就可以開始。"}
              </p>
            </div>
            <div className="space-y-3">
              {roles.map((role) => {
                const Icon = role.icon;
                return (
                  <div
                    key={role.title}
                    className="border-t border-white/12 pt-4 first:border-t-0 first:pt-0"
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-1 flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-[#ffd79b]">
                        <Icon className="h-5 w-5" />
                      </span>
                      <div>
                        <h2 className="font-display text-xl font-bold">
                          {role.title}
                        </h2>
                        <p className="mt-2 text-sm leading-7 text-white/72">
                          {role.body}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-6 p-8">
            <div>
              <p className="text-sm font-semibold text-primary">
                {locale === "en" ? "Choose a next step" : "選擇下一步"}
              </p>
              <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight">
                {locale === "en"
                  ? "Existing users can sign in. New users can create an account in minutes."
                  : "現有用戶可直接登入，新用戶可於幾分鐘內完成建立帳戶。"}
              </h2>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="bg-surface-tint">
                <CardContent className="space-y-4">
                  <h3 className="font-display text-2xl font-bold">
                    {locale === "en" ? "Sign in" : "登入"}
                  </h3>
                  <p className="text-sm leading-7 text-muted">
                    {locale === "en"
                      ? "Use your email or Hong Kong phone number together with your password."
                      : "使用你的電郵或香港電話號碼配合密碼登入。"}
                  </p>
                  <Link
                    href="/auth/login"
                    locale={locale}
                    className={`${buttonVariants({})} w-full`}
                  >
                    {locale === "en" ? "Go to login" : "前往登入"}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </CardContent>
              </Card>

              <Card className="bg-white">
                <CardContent className="space-y-4">
                  <h3 className="font-display text-2xl font-bold">
                    {locale === "en" ? "Create account" : "建立帳戶"}
                  </h3>
                  <p className="text-sm leading-7 text-muted">
                    {locale === "en"
                      ? "Public registration is available for customer and professional roles."
                      : "公開註冊現時支援客戶與師傅身份。"}
                  </p>
                  <Link
                    href="/auth/signup"
                    locale={locale}
                    className={`${buttonVariants({ variant: "outline" })} w-full`}
                  >
                    {locale === "en" ? "Go to signup" : "前往註冊"}
                  </Link>
                </CardContent>
              </Card>
            </div>

            <div className="rounded-[20px] border border-line bg-card/90 p-6">
              <h3 className="font-display text-2xl font-bold">
                {locale === "en" ? "How access works" : "登入後會點樣運作"}
              </h3>
              <div className="mt-4 space-y-3 text-sm leading-7 text-muted">
                <p>
                  {locale === "en"
                    ? "Customer accounts go to the request and booking workspace."
                    : "客戶帳戶會進入請求與訂單工作台。"}
                </p>
                <p>
                  {locale === "en"
                    ? "Professional accounts go to the open request, quote, and job workspace."
                    : "師傅帳戶會進入開放需求、報價與工作管理工作台。"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
