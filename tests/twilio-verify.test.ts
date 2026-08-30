import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockEnv = vi.hoisted(() => ({
  TWILIO_API_KEY: `SK${"a".repeat(32)}`,
  TWILIO_API_SECRET: "test-secret-with-at-least-16-characters",
  TWILIO_VERIFY_SERVICE_SID: `VA${"b".repeat(32)}`,
}));

vi.mock("@/lib/env", () => ({ env: mockEnv }));

import {
  checkTwilioSmsVerification,
  isTwilioVerifyConfigured,
  sendTwilioSmsVerification,
} from "@/lib/twilio-verify";

describe("Twilio Verify provider", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("sends a localized SMS to an E.164 Hong Kong number", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ status: "pending" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      sendTwilioSmsVerification({ phone: "91234567", locale: "zh-HK" }),
    ).resolves.toEqual({ status: "sent" });

    expect(isTwilioVerifyConfigured()).toBe(true);
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe(
      `https://verify.twilio.com/v2/Services/${mockEnv.TWILIO_VERIFY_SERVICE_SID}/Verifications`,
    );
    expect(init).toMatchObject({ method: "POST", cache: "no-store" });
    expect(init?.headers).toMatchObject({
      "Content-Type": "application/x-www-form-urlencoded",
    });
    expect((init?.body as URLSearchParams).toString()).toBe(
      "To=%2B85291234567&Channel=sms&Locale=zh-HK",
    );
  });

  it("accepts only an approved verification check", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "pending" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "approved" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    await expect(
      checkTwilioSmsVerification({ phone: "91234567", code: "000000" }),
    ).resolves.toEqual({ status: "invalid" });
    await expect(
      checkTwilioSmsVerification({ phone: "91234567", code: "123456" }),
    ).resolves.toEqual({ status: "approved" });
  });

  it("treats Twilio's missing verification response as expired", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ code: 20404 }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      checkTwilioSmsVerification({ phone: "91234567", code: "123456" }),
    ).resolves.toEqual({ status: "expired" });
  });

  it("treats Twilio's maximum check-attempt error as locked", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ code: 60202 }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      checkTwilioSmsVerification({ phone: "91234567", code: "000000" }),
    ).resolves.toEqual({ status: "locked" });
  });
});
