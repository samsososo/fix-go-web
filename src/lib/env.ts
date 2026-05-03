import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  APP_URL: z.url().default("http://localhost:3000"),
  DATA_DIR: z.string().min(1).default("data"),
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
  DEMO_PASSWORD: z.string().min(10).default("HotfixDemo123!"),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(10).default("HotfixAdmin123!"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
}

export const env = parsed.data;
export const enableDemoLogin =
  env.ENABLE_DEMO_LOGIN === undefined
    ? env.NODE_ENV !== "production"
    : env.ENABLE_DEMO_LOGIN === true || env.ENABLE_DEMO_LOGIN === "true";

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
