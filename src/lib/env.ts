import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  APP_URL: z.url().default("http://localhost:3000"),
  MONGODB_URI: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  MONGODB_DATABASE: z.string().min(1).default("hotfix_dev"),
  SESSION_COOKIE_NAME: z.string().min(3).default("hotfix_session"),
  SESSION_TTL_HOURS: z.coerce
    .number()
    .int()
    .min(1)
    .max(24 * 90)
    .default(24 * 30),
  ENABLE_DEMO_LOGIN: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional(),
  ENABLE_DATABASE_SEEDING: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional(),
  TWILIO_API_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z
      .string()
      .regex(/^SK[0-9a-fA-F]{32}$/)
      .optional(),
  ),
  TWILIO_API_SECRET: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(16).optional(),
  ),
  TWILIO_VERIFY_SERVICE_SID: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z
      .string()
      .regex(/^VA[0-9a-fA-F]{32}$/)
      .optional(),
  ),
  DEMO_PASSWORD: z.string().min(10).default("HotfixDemo123!"),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(10).default("HotfixAdmin123!"),
  STRIPE_SECRET_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z
      .string()
      .regex(/^sk_(?:test|live)_[A-Za-z0-9]+$/)
      .optional(),
  ),
  STRIPE_WEBHOOK_SECRET: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z
      .string()
      .regex(/^whsec_[A-Za-z0-9]+$/)
      .optional(),
  ),
  STRIPE_PRO_MONTHLY_PRICE_ID: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z
      .string()
      .regex(/^price_[A-Za-z0-9]+$/)
      .optional(),
  ),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
}

export const env = parsed.data;
function envBoolean(
  value: boolean | "true" | "false" | undefined,
  defaultValue: boolean,
) {
  if (value === undefined) {
    return defaultValue;
  }

  return value === true || value === "true";
}

export const enableDemoLogin = envBoolean(
  env.ENABLE_DEMO_LOGIN,
  env.NODE_ENV !== "production",
);
export const enableDatabaseSeeding = envBoolean(
  env.ENABLE_DATABASE_SEEDING,
  env.NODE_ENV !== "production",
);
export function isProduction() {
  return env.NODE_ENV === "production";
}

export function shouldUseSecureCookies() {
  try {
    const appUrl = new URL(env.APP_URL);
    return isProduction() && appUrl.protocol === "https:";
  } catch {
    return isProduction();
  }
}
