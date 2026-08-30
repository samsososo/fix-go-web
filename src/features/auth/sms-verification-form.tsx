"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useHydrated } from "@/hooks/use-hydrated";
import { resendPhoneOtpAction, verifyPhoneOtpAction } from "@/lib/actions";

export function SmsVerificationForm({
  locale,
  initialResendSeconds,
  initialExpirySeconds,
}: {
  locale: string;
  initialResendSeconds: number;
  initialExpirySeconds: number;
}) {
  const router = useRouter();
  const isHydrated = useHydrated();
  const [isVerifying, startVerifyTransition] = useTransition();
  const [isResending, startResendTransition] = useTransition();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resendSeconds, setResendSeconds] = useState(initialResendSeconds);
  const [expirySeconds, setExpirySeconds] = useState(initialExpirySeconds);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setResendSeconds((current) => Math.max(0, current - 1));
      setExpirySeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    startVerifyTransition(async () => {
      const result = await verifyPhoneOtpAction({ code, locale });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.replace(result.target);
    });
  };

  const handleResend = () => {
    setError(null);
    setNotice(null);
    startResendTransition(async () => {
      const result = await resendPhoneOtpAction({ locale });
      if (!result.ok) {
        setError(result.error);
        if (result.retryAfterSeconds) {
          setResendSeconds(result.retryAfterSeconds);
        }
        return;
      }

      setCode("");
      setResendSeconds(result.retryAfterSeconds);
      setExpirySeconds(result.codeExpiresInSeconds);
      setNotice(
        locale === "en"
          ? "A new verification code has been sent."
          : "新驗證碼已經發送。",
      );
    });
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <label htmlFor="sms-code" className="block font-semibold">
          {locale === "en" ? "6-digit verification code" : "6 位數字驗證碼"}
        </label>
        <Input
          id="sms-code"
          name="code"
          className="text-center font-mono text-2xl tracking-[0.4em]"
          value={code}
          onChange={(event) =>
            setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
          }
          autoComplete="one-time-code"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          placeholder="000000"
          autoFocus
          aria-invalid={error ? true : undefined}
          aria-describedby="sms-code-status"
        />
      </div>

      <div id="sms-code-status" aria-live="polite" className="min-h-6">
        {error ? (
          <p className="text-sm font-medium text-danger" role="alert">
            {error}
          </p>
        ) : notice ? (
          <p className="text-sm font-medium text-primary">{notice}</p>
        ) : (
          <p className="text-sm text-muted">
            {expirySeconds > 0
              ? locale === "en"
                ? `Code expires in ${expirySeconds} seconds.`
                : `驗證碼會喺 ${expirySeconds} 秒後過期。`
              : locale === "en"
                ? "The code has expired. Request a new one."
                : "驗證碼已過期，請重新發送。"}
          </p>
        )}
      </div>

      <Button
        className="w-full"
        type="submit"
        disabled={!isHydrated || isVerifying || code.length !== 6}
      >
        {isVerifying
          ? locale === "en"
            ? "Verifying..."
            : "驗證中⋯"
          : locale === "en"
            ? "Verify and continue"
            : "驗證並繼續"}
      </Button>

      <Button
        className="w-full"
        type="button"
        variant="outline"
        disabled={!isHydrated || isResending || resendSeconds > 0}
        onClick={handleResend}
      >
        {isResending
          ? locale === "en"
            ? "Sending..."
            : "發送中⋯"
          : resendSeconds > 0
            ? locale === "en"
              ? `Resend in ${resendSeconds}s`
              : `${resendSeconds} 秒後可重發`
            : locale === "en"
              ? "Resend code"
              : "重新發送驗證碼"}
      </Button>
    </form>
  );
}
