import { env } from "@/lib/env";

type TwilioVerifyConfig = {
  apiKey: string;
  apiSecret: string;
  serviceSid: string;
};

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type TwilioResponse = {
  code?: number;
  message?: string;
  status?: string;
};

export type SmsVerificationFailure =
  | "not_configured"
  | "provider_rejected"
  | "provider_unavailable";

export class SmsVerificationError extends Error {
  constructor(
    public readonly reason: SmsVerificationFailure,
    public readonly providerCode?: number,
  ) {
    super(reason);
    this.name = "SmsVerificationError";
  }
}

export function toHongKongE164(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const localNumber = digits.startsWith("852") ? digits.slice(3) : digits;

  if (!/^(5|6|8|9)\d{7}$/.test(localNumber)) {
    throw new SmsVerificationError("provider_rejected");
  }

  return `+852${localNumber}`;
}

async function readTwilioResponse(response: Response) {
  try {
    return (await response.json()) as TwilioResponse;
  } catch {
    return {} as TwilioResponse;
  }
}

export function createTwilioVerifyClient(
  config: TwilioVerifyConfig,
  fetchImpl: FetchLike = fetch,
) {
  const serviceUrl = `https://verify.twilio.com/v2/Services/${config.serviceSid}`;
  const authorization = `Basic ${Buffer.from(
    `${config.apiKey}:${config.apiSecret}`,
  ).toString("base64")}`;

  async function post(path: string, body: URLSearchParams) {
    let response: Response;
    try {
      response = await fetchImpl(`${serviceUrl}/${path}`, {
        method: "POST",
        headers: {
          Authorization: authorization,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
        cache: "no-store",
      });
    } catch {
      throw new SmsVerificationError("provider_unavailable");
    }

    const payload = await readTwilioResponse(response);
    if (!response.ok) {
      throw new SmsVerificationError(
        response.status >= 500 ? "provider_unavailable" : "provider_rejected",
        payload.code,
      );
    }

    return payload;
  }

  return {
    async sendCode(phone: string, locale: "zh-HK" | "en") {
      const body = new URLSearchParams({
        To: toHongKongE164(phone),
        Channel: "sms",
        Locale: locale,
      });
      const payload = await post("Verifications", body);

      if (payload.status !== "pending") {
        throw new SmsVerificationError("provider_rejected");
      }
    },

    async checkCode(phone: string, code: string) {
      try {
        const payload = await post(
          "VerificationCheck",
          new URLSearchParams({
            To: toHongKongE164(phone),
            Code: code,
          }),
        );
        return payload.status === "approved";
      } catch (error) {
        if (
          error instanceof SmsVerificationError &&
          error.reason === "provider_rejected" &&
          [20404, 60202, 60203].includes(error.providerCode ?? 0)
        ) {
          return false;
        }
        throw error;
      }
    },
  };
}

function getConfiguredClient() {
  if (
    !env.TWILIO_API_KEY ||
    !env.TWILIO_API_SECRET ||
    !env.TWILIO_VERIFY_SERVICE_SID
  ) {
    throw new SmsVerificationError("not_configured");
  }

  return createTwilioVerifyClient({
    apiKey: env.TWILIO_API_KEY,
    apiSecret: env.TWILIO_API_SECRET,
    serviceSid: env.TWILIO_VERIFY_SERVICE_SID,
  });
}

export async function sendSmsVerificationCode(
  phone: string,
  locale: "zh-HK" | "en",
) {
  await getConfiguredClient().sendCode(phone, locale);
}

export async function checkSmsVerificationCode(phone: string, code: string) {
  return getConfiguredClient().checkCode(phone, code);
}
