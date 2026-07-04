import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { Link } from "@/i18n/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { LoginForm } from "@/features/auth/login-form";
import { signInDemoAction } from "@/lib/actions";
import { enableDemoLogin, env } from "@/lib/env";
import { listDemoUsers } from "@/lib/mock/repositories";
import { createPageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as "zh-HK" | "en";
  return createPageMetadata(locale, "/auth/login");
}

export default async function LoginPage() {
  const locale = await getLocale();
  const demoUsers = enableDemoLogin ? await listDemoUsers() : [];
  const leftPanelPoints =
    locale === "en"
      ? [
          "One account system for customers and professionals",
          "Role-aware routing after authentication",
          "Persistent server-side session handling",
        ]
      : [
          "客戶與師傅共用同一帳戶系統",
          "登入後按身份自動進入對應工作台",
          "以伺服器端 session 持續保持登入狀態",
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
              {locale === "en"
                ? "Shared login for customer and pro roles"
                : "客戶與師傅共用登入入口"}
            </h1>
            <p className="text-sm leading-7 text-white/75">
              {locale === "en"
                ? "Use the same account system to enter the right workspace, whether you are booking a job or quoting for one."
                : "無論你係住戶定師傅，都可以用同一帳戶系統登入，再進入合適嘅工作台。"}
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
                  {locale === "en" ? "View access overview" : "查看登入總覽"}
                </Link>
              </p>
            </div>
            <LoginForm locale={locale} />
            {enableDemoLogin ? (
              <div className="space-y-3 border-t border-line pt-5">
                <p className="text-sm font-semibold">
                  {locale === "en" ? "Local quick access" : "本地快速登入"}
                </p>
                <p className="text-xs text-muted">
                  {locale === "en"
                    ? `Bootstrap local password: ${env.DEMO_PASSWORD}`
                    : `Bootstrap 本地密碼：${env.DEMO_PASSWORD}`}
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  {demoUsers.map((user) => (
                    <form
                      key={user.id}
                      action={async () => {
                        "use server";
                        const result = await signInDemoAction({
                          userId: user.id,
                          locale,
                        });
                        if (!result.ok) {
                          redirect(`/auth/login`);
                        }
                        redirect(result.target ?? `/auth/login`);
                      }}
                      className="rounded-2xl border border-line bg-white p-4"
                    >
                      <p className="font-semibold">{user.fullName}</p>
                      <p className="text-xs text-muted">
                        {user.role} · {user.email ?? user.phone}
                      </p>
                      <button
                        className="mt-3 text-sm font-semibold text-primary"
                        type="submit"
                      >
                        {locale === "en" ? "Sign in locally" : "以本地帳戶登入"}
                      </button>
                    </form>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
