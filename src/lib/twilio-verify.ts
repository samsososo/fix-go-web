import { env } from "@/lib/env";

const TWILIO_VERIFY_BASE_URL = "https://verify.twilio.com/v2";
const TWILIO_REQUEST_TIMEOUT_MS = 10_000;

type TwilioVerifyStatus =
  | "pending"
  | "approved"
  | "canceled"
  | "max_attempts_reached"
  | "deleted"
  | "failed"
  | "expired";

type TwilioVerifyResponse = {
  status?: TwilioVerifyStatus;
  code?: number;
};

export function isTwilioVerifyConfigured() {
  return Boolean(
    env.TWILIO_API_KEY &&
    env.TWILIO_API_SECRET &&
    env.TWILIO_VERIFY_SERVICE_SID,
  );
}

function requireTwilioVerifyCredentials() {
  if (!isTwilioVerifyConfigured()) {
    throw new Error("Twilio Verify is not configured.");
  }

  return {
    apiKey: env.TWILIO_API_KEY!,
    apiSecret: env.TWILIO_API_SECRET!,
    serviceSid: env.TWILIO_VERIFY_SERVICE_SID!,
  };
}

function toHongKongE164(phone: string) {
  if (!/^(5|6|8|9)\d{7}$/.test(phone)) {
    throw new Error("A valid Hong Kong mobile number is required.");
  }
  return `+852${phone}`;
}

async function twilioVerifyPost(
  resource: "Verifications" | "VerificationCheck",
  body: URLSearchParams,
) {
  const credentials = requireTwilioVerifyCredentials();
  const response = await fetch(
    `${TWILIO_VERIFY_BASE_URL}/Services/${credentials.serviceSid}/${resource}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${credentials.apiKey}:${credentials.apiSecret}`,
        ).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(TWILIO_REQUEST_TIMEOUT_MS),
    },
  );

  let payload: TwilioVerifyResponse = {};
  try {
    payload = (await response.json()) as TwilioVerifyResponse;
  } catch {
    // Twilio errors are intentionally not copied into application logs because
    // they can contain the destination phone number.
  }

  return { ok: response.ok, statusCode: response.status, payload };
}

export async function sendTwilioSmsVerification(input: {
  phone: string;
  locale: "zh-HK" | "en";
}) {
  const body = new URLSearchParams({
    To: toHongKongE164(input.phone),
    Channel: "sms",
    Locale: input.locale,
  });
  const response = await twilioVerifyPost("Verifications", body);
  if (!response.ok || response.payload.status !== "pending") {
    throw new Error("Twilio Verify could not send the verification code.");
  }
  return { status: "sent" as const };
}

export async function checkTwilioSmsVerification(input: {
  phone: string;
  code: string;
}) {
  const body = new URLSearchParams({
    To: toHongKongE164(input.phone),
    Code: input.code,
  });
  const response = await twilioVerifyPost("VerificationCheck", body);

  if (response.payload.code === 60202) {
    return { status: "locked" as const };
  }
  if (response.statusCode === 404) {
    return { status: "expired" as const };
  }
  if (!response.ok) {
    throw new Error("Twilio Verify could not check the verification code.");
  }

  switch (response.payload.status) {
    case "approved":
      return { status: "approved" as const };
    case "pending":
      return { status: "invalid" as const };
    case "max_attempts_reached":
      return { status: "locked" as const };
    case "canceled":
    case "deleted":
    case "failed":
    case "expired":
      return { status: "expired" as const };
    default:
      throw new Error("Twilio Verify returned an unexpected status.");
  }
}
