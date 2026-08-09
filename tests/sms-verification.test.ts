import { describe, expect, it, vi } from "vitest";

import {
  createTwilioVerifyClient,
  SmsVerificationError,
  toHongKongE164,
} from "@/lib/sms-verification";

const config = {
  apiKey: `SK${"a".repeat(32)}`,
  apiSecret: "test-secret-with-enough-length",
  serviceSid: `VA${"b".repeat(32)}`,
};

function jsonResponse(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Twilio SMS verification", () => {
  it("normalizes Hong Kong mobile numbers to E.164", () => {
    expect(toHongKongE164("9123 4567")).toBe("+85291234567");
    expect(toHongKongE164("+852 6123 4567")).toBe("+85261234567");
    expect(() => toHongKongE164("21234567")).toThrow(SmsVerificationError);
  });

  it("sends a Chinese SMS verification request", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(jsonResponse({ status: "pending" }));
    const client = createTwilioVerifyClient(config, request);

    await client.sendCode("91234567", "zh-HK");

    expect(request).toHaveBeenCalledOnce();
    const [url, init] = request.mock.calls[0];
    expect(url).toBe(
      `https://verify.twilio.com/v2/Services/${config.serviceSid}/Verifications`,
    );
    expect(init.method).toBe("POST");
    expect(init.body.toString()).toContain("To=%2B85291234567");
    expect(init.body.toString()).toContain("Channel=sms");
    expect(init.body.toString()).toContain("Locale=zh-HK");
  });

  it("accepts only an approved verification check", async () => {
    const approvedRequest = vi
      .fn()
      .mockResolvedValue(jsonResponse({ status: "approved" }));
    const pendingRequest = vi
      .fn()
      .mockResolvedValue(jsonResponse({ status: "pending" }));

    await expect(
      createTwilioVerifyClient(config, approvedRequest).checkCode(
        "91234567",
        "123456",
      ),
    ).resolves.toBe(true);
    await expect(
      createTwilioVerifyClient(config, pendingRequest).checkCode(
        "91234567",
        "654321",
      ),
    ).resolves.toBe(false);
  });

  it("treats expired verification sessions as invalid codes", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(jsonResponse({ code: 20404 }, 404));

    await expect(
      createTwilioVerifyClient(config, request).checkCode("91234567", "123456"),
    ).resolves.toBe(false);
  });
});
