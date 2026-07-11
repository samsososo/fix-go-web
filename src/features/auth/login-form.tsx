"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { startLoginAction } from "@/lib/actions";
import { useHydrated } from "@/hooks/use-hydrated";
import { loginSchema, type LoginInput } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";

export function LoginForm({ locale }: { locale: string }) {
  const router = useRouter();
  const isHydrated = useHydrated();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: "", password: "" },
  });

  const onSubmit = (values: LoginInput) => {
    setServerError(null);
    startTransition(async () => {
      const result = await startLoginAction({
        identifier: values.identifier,
        password: values.password,
        locale,
      });
      if (!result.ok) {
        setServerError(result.error ?? "Unable to continue.");
        return;
      }

      router.push(result.target ?? `/auth/login`);
    });
  };

  return (
    <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
      <Field
        label={locale === "en" ? "Email or Hong Kong phone" : "電郵或香港電話"}
        error={
          form.formState.errors.identifier?.message || serverError || undefined
        }
        hint={
          locale === "en"
            ? "Example: name@example.com or 91234567"
            : "例如 name@example.com 或 91234567"
        }
      >
        <Input
          {...form.register("identifier")}
          placeholder="name@example.com / 91234567"
        />
      </Field>
      <Field
        label={locale === "en" ? "Password" : "密碼"}
        error={form.formState.errors.password?.message}
      >
        <Input
          {...form.register("password")}
          type="password"
          placeholder="********"
        />
      </Field>
      <div className="text-right">
        <Link
          className="text-sm font-semibold text-primary hover:underline"
          href="/auth/forgot-password"
          locale={locale}
        >
          {locale === "en" ? "Forgot password?" : "忘記密碼？"}
        </Link>
      </div>
      <Button
        className="w-full"
        type="submit"
        disabled={!isHydrated || isPending}
      >
        {isPending ? "..." : locale === "en" ? "Sign in" : "登入"}
      </Button>
    </form>
  );
}
