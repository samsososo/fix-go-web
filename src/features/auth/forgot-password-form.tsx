"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, KeyRound } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Button, buttonVariants } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useHydrated } from "@/hooks/use-hydrated";
import { Link } from "@/i18n/navigation";
import { resetPasswordAction } from "@/lib/actions";
import { securityQuestions } from "@/lib/account-recovery";
import {
  passwordResetSchema,
  type PasswordResetFormValues,
  type PasswordResetInput,
} from "@/lib/validation";

export function ForgotPasswordForm({ locale }: { locale: string }) {
  const isHydrated = useHydrated();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const form = useForm<
    PasswordResetFormValues,
    unknown,
    PasswordResetInput
  >({
    resolver: zodResolver(passwordResetSchema),
    defaultValues: {
      phone: "",
      dateOfBirth: "",
      securityQuestionId: "childhood_nickname",
      securityAnswer: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const onSubmit = (values: PasswordResetInput) => {
    setServerError(null);
    startTransition(async () => {
      const result = await resetPasswordAction({ ...values, locale });
      if (!result.ok) {
        setServerError(result.error);
        return;
      }

      setIsComplete(true);
      form.reset();
    });
  };

  if (isComplete) {
    return (
      <div className="space-y-6" role="status">
        <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary-soft p-4">
          <CheckCircle2
            aria-hidden="true"
            className="mt-0.5 h-5 w-5 shrink-0 text-primary"
          />
          <div>
            <p className="font-semibold text-ink">
              {locale === "en" ? "Password updated" : "密碼已更新"}
            </p>
            <p className="mt-1 text-sm leading-6 text-muted">
              {locale === "en"
                ? "Your previous sessions have been signed out. Use the new password to log in."
                : "舊有登入已經登出，請使用新密碼重新登入。"}
            </p>
          </div>
        </div>
        <Link
          className={buttonVariants({ className: "w-full" })}
          href="/auth/login"
          locale={locale}
        >
          <KeyRound aria-hidden="true" className="h-4 w-4" />
          {locale === "en" ? "Log in" : "返回登入"}
        </Link>
      </div>
    );
  }

  return (
    <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
      <Field
        label={locale === "en" ? "WhatsApp phone" : "WhatsApp 聯絡電話"}
        error={form.formState.errors.phone?.message}
      >
        <Input
          {...form.register("phone")}
          autoComplete="tel"
          inputMode="numeric"
          placeholder="91234567"
        />
      </Field>
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
        label={locale === "en" ? "New password" : "新密碼"}
        error={form.formState.errors.newPassword?.message}
      >
        <Input
          {...form.register("newPassword")}
          autoComplete="new-password"
          type="password"
        />
      </Field>
      <Field
        label={locale === "en" ? "Confirm new password" : "確認新密碼"}
        error={form.formState.errors.confirmPassword?.message}
      >
        <Input
          {...form.register("confirmPassword")}
          autoComplete="new-password"
          type="password"
        />
      </Field>
      {serverError ? (
        <p className="text-sm text-danger" role="alert">
          {serverError}
        </p>
      ) : null}
      <Button
        className="w-full"
        disabled={!isHydrated || isPending}
        type="submit"
      >
        <KeyRound aria-hidden="true" className="h-4 w-4" />
        {isPending
          ? "..."
          : locale === "en"
            ? "Reset password"
            : "重設密碼"}
      </Button>
    </form>
  );
}
