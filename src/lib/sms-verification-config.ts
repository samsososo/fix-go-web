import { z } from "zod";

export const SMS_VERIFICATION_CONFIG_ID = "feature:smsVerification";

export const smsVerificationConfigSchema = z.object({
  enabled: z.boolean(),
  provider: z.literal("console"),
  otpTtlSeconds: z
    .number()
    .int()
    .min(60)
    .max(15 * 60),
  resendCooldownSeconds: z
    .number()
    .int()
    .min(30)
    .max(10 * 60),
  maxAttempts: z.number().int().min(1).max(10),
  maxSendsPerHour: z.number().int().min(1).max(20),
});

export type SmsVerificationConfig = z.infer<typeof smsVerificationConfigSchema>;

export type SmsVerificationConfigState = SmsVerificationConfig & {
  effectiveEnabled: boolean;
  forceOff: boolean;
  updatedAt?: string;
  updatedBy?: string;
};

export const defaultSmsVerificationConfig: SmsVerificationConfig = {
  enabled: false,
  provider: "console",
  otpTtlSeconds: 5 * 60,
  resendCooldownSeconds: 60,
  maxAttempts: 5,
  maxSendsPerHour: 5,
};

export function resolveSmsVerificationConfig(
  value: unknown,
  forceOff: boolean,
): SmsVerificationConfigState {
  const parsed = smsVerificationConfigSchema.safeParse(value);
  const config = parsed.success
    ? parsed.data
    : { ...defaultSmsVerificationConfig };
  const metadata =
    typeof value === "object" && value !== null
      ? (value as { updatedAt?: unknown; updatedBy?: unknown })
      : {};

  return {
    ...config,
    effectiveEnabled: config.enabled && !forceOff,
    forceOff,
    updatedAt:
      typeof metadata.updatedAt === "string" ? metadata.updatedAt : undefined,
    updatedBy:
      typeof metadata.updatedBy === "string" ? metadata.updatedBy : undefined,
  };
}
