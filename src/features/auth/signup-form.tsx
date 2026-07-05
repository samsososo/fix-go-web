"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";

import { signUpAction } from "@/lib/actions";
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
  const [isPending, startTransition] = useTransition();
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
      password: "",
      confirmPassword: "",
    },
  });
  const role = useWatch({ control: form.control, name: "role" });

  const onSubmit = (values: SignupInput) => {
    setServerError(null);
    startTransition(async () => {
      const result = await signUpAction(values);
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
            ? "Use a Hong Kong mobile number that can be reached on WhatsApp."
            : "請填可用 WhatsApp 聯絡的香港手提電話。"
        }
        error={form.formState.errors.phone?.message}
      >
        <Input {...form.register("phone")} placeholder="91234567" />
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
      <Field
        label={locale === "en" ? "Password" : "密碼"}
        error={form.formState.errors.password?.message}
      >
        <Input
          {...form.register("password")}
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
          type="password"
          placeholder="Repeat password"
        />
      </Field>
      {serverError ? (
        <p className="text-sm text-danger">{serverError}</p>
      ) : null}
      <Button
        className="w-full"
        type="submit"
        disabled={!isHydrated || isPending}
      >
        {isPending ? "..." : locale === "en" ? "Create account" : "建立帳戶"}
      </Button>
    </form>
  );
}
