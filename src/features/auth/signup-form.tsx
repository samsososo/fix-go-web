"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";

import { signUpAction } from "@/lib/actions";
import { securityQuestions } from "@/lib/account-recovery";
import { useHydrated } from "@/hooks/use-hydrated";
import {
  signupSchema,
  type SignupFormValues,
  type SignupInput,
} from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function SignupForm({
  locale,
  categoryOptions,
}: {
  locale: string;
  categoryOptions: { id: string; label: string }[];
}) {
  const router = useRouter();
  const isHydrated = useHydrated();
  const [isSubmitting, startSubmitTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<SignupFormValues, unknown, SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      fullName: "",
      phone: "",
      email: "",
      role: "customer",
      serviceCategoryIds: [],
      locale: "zh-HK",
      dateOfBirth: "",
      securityQuestionId: "childhood_nickname",
      securityAnswer: "",
      password: "",
      confirmPassword: "",
    },
  });
  const role = useWatch({ control: form.control, name: "role" });

  const onSubmit = (values: SignupInput) => {
    setServerError(null);
    startSubmitTransition(async () => {
      const result = await signUpAction({ ...values, interfaceLocale: locale });
      if (!result.ok) {
        setServerError(result.error ?? "Unable to create account.");
        return;
      }

      router.push(result.target ?? "/");
    });
  };

  return (
    <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
      <Field
        label={locale === "en" ? "Full name" : "姓名"}
        error={form.formState.errors.fullName?.message}
      >
        <Input {...form.register("fullName")} />
      </Field>
      <Field
        label={locale === "en" ? "WhatsApp contact phone" : "WhatsApp 聯絡電話"}
        hint={
          locale === "en"
            ? "Use a Hong Kong mobile number for contact, login and account recovery."
            : "請填香港手提電話，用作聯絡、登入及重設密碼。"
        }
        error={form.formState.errors.phone?.message}
      >
        <Input
          {...form.register("phone")}
          autoComplete="tel"
          inputMode="tel"
          placeholder="91234567"
        />
      </Field>
      <Field
        label={locale === "en" ? "Email (optional)" : "電郵（可留空）"}
        error={form.formState.errors.email?.message}
      >
        <Input {...form.register("email")} placeholder="you@example.com" />
      </Field>
      <Field
        label={locale === "en" ? "Role" : "身份"}
        error={form.formState.errors.role?.message}
      >
        <Select {...form.register("role")}>
          <option value="customer">
            {locale === "en" ? "Customer" : "客戶"}
          </option>
          <option value="pro">{locale === "en" ? "Pro" : "師傅"}</option>
        </Select>
      </Field>
      {role === "pro" ? (
        <Field
          label={locale === "en" ? "Specialties" : "專長"}
          error={form.formState.errors.serviceCategoryIds?.message}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {categoryOptions.map((category) => (
              <label
                key={category.id}
                className="flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 text-sm font-semibold"
              >
                <input
                  {...form.register("serviceCategoryIds")}
                  type="checkbox"
                  value={category.id}
                />
                {category.label}
              </label>
            ))}
          </div>
        </Field>
      ) : null}
      <Field
        label={locale === "en" ? "Preferred language" : "偏好語言"}
        error={form.formState.errors.locale?.message}
      >
        <Select {...form.register("locale")}>
          <option value="zh-HK">繁體中文</option>
        </Select>
      </Field>
      <div className="space-y-5 border-t border-line/70 pt-5">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
            <ShieldCheck aria-hidden="true" className="h-4 w-4" />
          </span>
          <div>
            <p className="font-semibold text-ink">
              {locale === "en" ? "Account recovery" : "重設密碼資料"}
            </p>
            <p className="mt-1 text-sm leading-6 text-muted">
              {locale === "en"
                ? "Keep these details memorable. You will need all of them if you forget your password."
                : "請填你一定記得嘅資料，忘記密碼時三項都要答啱。"}
            </p>
          </div>
        </div>
        <Field
          label={locale === "en" ? "Date of birth" : "出生日期"}
          error={form.formState.errors.dateOfBirth?.message}
        >
          <Input
            {...form.register("dateOfBirth")}
            autoComplete="bday"
            type="date"
          />
        </Field>
        <Field
          label={locale === "en" ? "Security question" : "保安問題"}
          error={form.formState.errors.securityQuestionId?.message}
        >
          <Select {...form.register("securityQuestionId")}>
            {securityQuestions.map((question) => (
              <option key={question.id} value={question.id}>
                {question.label[locale === "en" ? "en" : "zh-HK"]}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={locale === "en" ? "Your answer" : "答案"}
          hint={
            locale === "en"
              ? "Answers are not case-sensitive."
              : "答案不分英文大小寫。"
          }
          error={form.formState.errors.securityAnswer?.message}
        >
          <Input {...form.register("securityAnswer")} autoComplete="off" />
        </Field>
        <Field
          label={locale === "en" ? "Password" : "密碼"}
          error={form.formState.errors.password?.message}
        >
          <Input
            {...form.register("password")}
            autoComplete="new-password"
            type="password"
            placeholder="Strong password"
          />
        </Field>
        <Field
          label={locale === "en" ? "Confirm password" : "確認密碼"}
          error={form.formState.errors.confirmPassword?.message}
        >
          <Input
            {...form.register("confirmPassword")}
            autoComplete="new-password"
            type="password"
            placeholder="Repeat password"
          />
        </Field>
      </div>
      {serverError ? (
        <p className="text-sm text-danger" role="alert">
          {serverError}
        </p>
      ) : null}
      <Button
        className="w-full"
        type="submit"
        disabled={!isHydrated || isSubmitting}
      >
        {isSubmitting ? "..." : locale === "en" ? "Create account" : "建立帳戶"}
      </Button>
    </form>
  );
}
