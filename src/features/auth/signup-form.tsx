"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, MessageSquareText, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";

import {
  requestSignupPhoneOtpAction,
  signUpAction,
  verifySignupPhoneOtpAction,
} from "@/lib/actions";
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
  smsVerification,
}: {
  locale: string;
  categoryOptions: { id: string; label: string }[];
  smsVerification: {
    enabled: boolean;
    initial?: {
      phone: string;
      maskedPhone: string;
      verified: boolean;
      resendSeconds: number;
      expirySeconds: number;
      consolePocCode?: string;
    };
  };
}) {
  const router = useRouter();
  const isHydrated = useHydrated();
  const [isSubmitting, startSubmitTransition] = useTransition();
  const [isRequestingOtp, startRequestOtpTransition] = useTransition();
  const [isVerifyingOtp, startVerifyOtpTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [smsError, setSmsError] = useState<string | null>(null);
  const [smsNotice, setSmsNotice] = useState<string | null>(null);
  const [smsCode, setSmsCode] = useState("");
  const [challengePhone, setChallengePhone] = useState(
    smsVerification.initial?.phone ?? "",
  );
  const [maskedPhone, setMaskedPhone] = useState(
    smsVerification.initial?.maskedPhone ?? "",
  );
  const [verifiedPhone, setVerifiedPhone] = useState(
    smsVerification.initial?.verified
      ? (smsVerification.initial.phone ?? "")
      : "",
  );
  const [resendSeconds, setResendSeconds] = useState(
    smsVerification.initial?.resendSeconds ?? 0,
  );
  const [expirySeconds, setExpirySeconds] = useState(
    smsVerification.initial?.expirySeconds ?? 0,
  );
  const [consolePocCode, setConsolePocCode] = useState(
    smsVerification.initial?.consolePocCode,
  );
  const form = useForm<SignupFormValues, unknown, SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      fullName: "",
      phone: smsVerification.initial?.phone ?? "",
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
  const phone = useWatch({ control: form.control, name: "phone" }) ?? "";
  const normalizedPhone = phone.replace(/\D/g, "");
  const isValidPhone = /^(5|6|8|9)\d{7}$/.test(normalizedPhone);
  const phoneMatchesChallenge =
    challengePhone.length > 0 && challengePhone === normalizedPhone;
  const phoneVerified =
    verifiedPhone.length > 0 && verifiedPhone === normalizedPhone;

  useEffect(() => {
    if (!smsVerification.enabled || !challengePhone) {
      return;
    }
    const timer = window.setInterval(() => {
      setResendSeconds((current) => Math.max(0, current - 1));
      setExpirySeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [challengePhone, smsVerification.enabled]);

  const handleRequestOtp = () => {
    setServerError(null);
    setSmsError(null);
    setSmsNotice(null);
    const phoneToVerify = normalizedPhone;
    if (!/^(5|6|8|9)\d{7}$/.test(phoneToVerify)) {
      setSmsError(
        locale === "en"
          ? "Enter a valid Hong Kong mobile number."
          : "請輸入有效香港手提電話。",
      );
      return;
    }

    form.setValue("phone", phoneToVerify, { shouldValidate: true });
    startRequestOtpTransition(async () => {
      const result = await requestSignupPhoneOtpAction({
        phone: phoneToVerify,
        locale,
        role: role ?? "customer",
      });
      if (!result.ok) {
        setSmsError(result.error);
        if (result.retryAfterSeconds) {
          setResendSeconds(result.retryAfterSeconds);
        }
        return;
      }

      setChallengePhone(result.phone);
      setMaskedPhone(result.maskedPhone);
      setVerifiedPhone("");
      setSmsCode("");
      setResendSeconds(result.retryAfterSeconds);
      setExpirySeconds(result.codeExpiresInSeconds);
      setConsolePocCode(result.consolePocCode);
      setSmsNotice(
        result.alreadySent
          ? locale === "en"
            ? "A code was already sent to this number."
            : "驗證碼已經發送去呢個電話。"
          : locale === "en"
            ? `A verification code was sent to ${result.maskedPhone}.`
            : `驗證碼已發送去 ${result.maskedPhone}。`,
      );
    });
  };

  const handleVerifyOtp = () => {
    setServerError(null);
    setSmsError(null);
    setSmsNotice(null);
    startVerifyOtpTransition(async () => {
      const result = await verifySignupPhoneOtpAction({
        phone: normalizedPhone,
        code: smsCode,
        locale,
      });
      if (!result.ok) {
        setSmsError(result.error);
        return;
      }

      setVerifiedPhone(result.phone);
      setSmsNotice(
        locale === "en"
          ? "Phone number verified. You can now create your account."
          : "電話號碼已驗證，而家可以建立帳戶。",
      );
    });
  };

  const onSubmit = (values: SignupInput) => {
    setServerError(null);
    if (smsVerification.enabled && !phoneVerified) {
      setServerError(
        locale === "en"
          ? "Verify this phone number before creating your account."
          : "請先驗證呢個電話號碼，再建立帳戶。",
      );
      return;
    }
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
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Input
            {...form.register("phone")}
            autoComplete="tel"
            inputMode="tel"
            placeholder="91234567"
          />
          {smsVerification.enabled ? (
            <Button
              className="w-full whitespace-nowrap sm:w-auto"
              type="button"
              variant="outline"
              disabled={
                !isHydrated ||
                isRequestingOtp ||
                !isValidPhone ||
                phoneVerified ||
                (phoneMatchesChallenge && resendSeconds > 0)
              }
              onClick={handleRequestOtp}
            >
              {isRequestingOtp
                ? locale === "en"
                  ? "Sending..."
                  : "發送中⋯"
                : phoneVerified
                  ? locale === "en"
                    ? "Verified"
                    : "已驗證"
                  : phoneMatchesChallenge && resendSeconds > 0
                    ? locale === "en"
                      ? `Resend in ${resendSeconds}s`
                      : `${resendSeconds} 秒後重發`
                    : locale === "en"
                      ? "Receive SMS"
                      : "收取驗證碼"}
            </Button>
          ) : null}
        </div>
      </Field>
      {smsVerification.enabled && challengePhone ? (
        <div
          className="space-y-4 rounded-2xl border border-line bg-primary-soft/35 p-4"
          aria-live="polite"
        >
          {!phoneMatchesChallenge ? (
            <p className="text-sm font-medium text-danger">
              {locale === "en"
                ? "The phone number changed. Request a new code for this number."
                : "電話號碼已更改，請為呢個號碼重新收取驗證碼。"}
            </p>
          ) : phoneVerified ? (
            <div className="flex items-start gap-3 text-primary">
              <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5" />
              <div>
                <p className="font-semibold">
                  {locale === "en" ? "Phone verified" : "電話已驗證"}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {locale === "en"
                    ? `${maskedPhone} will be used for this account.`
                    : `${maskedPhone} 將會用作呢個帳戶嘅聯絡電話。`}
                </p>
              </div>
            </div>
          ) : (
            <>
              <div>
                <label htmlFor="signup-sms-code" className="font-semibold">
                  {locale === "en"
                    ? "6-digit verification code"
                    : "6 位數字驗證碼"}
                </label>
                <div className="mt-2 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <Input
                    id="signup-sms-code"
                    className="text-center font-mono text-xl tracking-[0.3em]"
                    value={smsCode}
                    onChange={(event) =>
                      setSmsCode(
                        event.target.value.replace(/\D/g, "").slice(0, 6),
                      )
                    }
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    placeholder="000000"
                  />
                  <Button
                    className="w-full whitespace-nowrap sm:w-auto"
                    type="button"
                    disabled={
                      !isHydrated || isVerifyingOtp || smsCode.length !== 6
                    }
                    onClick={handleVerifyOtp}
                  >
                    {isVerifyingOtp
                      ? locale === "en"
                        ? "Verifying..."
                        : "驗證中⋯"
                      : locale === "en"
                        ? "Verify phone"
                        : "驗證電話"}
                  </Button>
                </div>
              </div>
              {consolePocCode ? (
                <div className="flex gap-3 rounded-xl border border-secondary/30 bg-secondary/10 p-3 text-sm">
                  <MessageSquareText
                    aria-hidden="true"
                    className="mt-0.5 h-5 w-5 shrink-0 text-secondary-foreground"
                  />
                  <p>
                    Development POC：
                    {locale === "en" ? "use test code" : "請使用測試碼"}{" "}
                    <strong className="font-mono">{consolePocCode}</strong>
                  </p>
                </div>
              ) : null}
              <p className="text-sm text-muted">
                {expirySeconds > 0
                  ? locale === "en"
                    ? `The code sent to ${maskedPhone} expires in ${expirySeconds} seconds.`
                    : `發送去 ${maskedPhone} 嘅驗證碼會喺 ${expirySeconds} 秒後過期。`
                  : locale === "en"
                    ? "The code has expired. Request a new one."
                    : "驗證碼已過期，請重新發送。"}
              </p>
            </>
          )}
          {smsError ? (
            <p className="text-sm font-medium text-danger" role="alert">
              {smsError}
            </p>
          ) : smsNotice ? (
            <p className="text-sm font-medium text-primary">{smsNotice}</p>
          ) : null}
        </div>
      ) : smsVerification.enabled && smsError ? (
        <p className="text-sm font-medium text-danger" role="alert">
          {smsError}
        </p>
      ) : null}
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
          hint={
            locale === "en"
              ? "Use at least 8 characters."
              : "密碼最少需要 8 個字元。"
          }
          error={form.formState.errors.password?.message}
        >
          <Input
            {...form.register("password")}
            autoComplete="new-password"
            minLength={8}
            type="password"
            placeholder={
              locale === "en" ? "At least 8 characters" : "最少 8 個字元"
            }
          />
        </Field>
        <Field
          label={locale === "en" ? "Confirm password" : "確認密碼"}
          error={form.formState.errors.confirmPassword?.message}
        >
          <Input
            {...form.register("confirmPassword")}
            autoComplete="new-password"
            minLength={8}
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
        disabled={
          !isHydrated ||
          isSubmitting ||
          (smsVerification.enabled && !phoneVerified)
        }
      >
        {isSubmitting ? "..." : locale === "en" ? "Create account" : "建立帳戶"}
      </Button>
    </form>
  );
}
