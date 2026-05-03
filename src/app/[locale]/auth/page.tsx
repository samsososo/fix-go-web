import { ArrowRight, BriefcaseBusiness, Building2, House } from "lucide-react";
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
            body: "Create a request, compare structured quotes, accept one professional, and track the booking timeline.",
          },
          {
            icon: BriefcaseBusiness,
            title: "Professional",
            body: "Complete your trade profile, review matched leads, send quotes, and update job progress.",
          },
          {
            icon: Building2,
            title: "Ops / Admin",
            body: "Inspect customers, pros, requests, and quotes. Apply manual status updates when operations need to intervene.",
          },
        ]
      : [
          {
            icon: House,
            title: "客戶",
            body: "建立服務請求、比較結構化報價、接受其中一位師傅，並追蹤訂單時間線。",
          },
          {
            icon: BriefcaseBusiness,
            title: "師傅",
            body: "完善工種檔案、查看已配對工作機會、提交報價，並更新服務進度。",
          },
          {
            icon: Building2,
            title: "營運",
            body: "檢視客戶、師傅、請求及報價，並於需要時作人手狀態調整。",
          },
        ];

  return (
    <div className="content-wrap py-10">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="bg-surface-strong text-white">
          <CardContent className="space-y-6 p-8">
            <p className="text-sm font-semibold text-[#a8e2d4]">
              {locale === "en" ? "Access overview" : "平台登入總覽"}
            </p>
            <div className="space-y-4">
              <h1 className="font-display text-4xl font-extrabold tracking-tight">
                {locale === "en"
                  ? "One platform, three role-based workspaces"
                  : "同一平台，三個角色化工作台"}
              </h1>
              <p className="text-sm leading-7 text-white/72">
                {locale === "en"
                  ? "Choose the right route before you sign in. Customers, professionals, and operations share the same account system, but each role lands in a different workflow."
                  : "登入前先了解正確入口。客戶、師傅與營運共用同一帳戶系統，但登入後會進入不同工作流程。"}
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
                    ? "Professional accounts go to the lead, quote, and job workspace."
                    : "師傅帳戶會進入工作機會、報價與工作管理工作台。"}
                </p>
                <p>
                  {locale === "en"
                    ? "Admin accounts remain internal and open the ops workspace directly."
                    : "營運帳戶屬內部使用，會直接進入營運後台。"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
