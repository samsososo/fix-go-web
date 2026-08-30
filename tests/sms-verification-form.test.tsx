/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  resendPhoneOtpAction: vi.fn(),
  verifyPhoneOtpAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock("@/lib/actions", () => ({
  resendPhoneOtpAction: mocks.resendPhoneOtpAction,
  verifyPhoneOtpAction: mocks.verifyPhoneOtpAction,
}));

import { SmsVerificationForm } from "@/features/auth/sms-verification-form";

describe("SMS verification mobile form", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses mobile OTP autofill and continues only after a valid code", async () => {
    const user = userEvent.setup();
    mocks.verifyPhoneOtpAction.mockResolvedValue({
      ok: true,
      target: "/customer",
    });
    render(
      <SmsVerificationForm
        locale="zh-HK"
        initialResendSeconds={60}
        initialExpirySeconds={300}
      />,
    );

    const input = screen.getByLabelText("6 位數字驗證碼");
    expect(input).toHaveAttribute("autocomplete", "one-time-code");
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveAttribute("maxlength", "6");
    const submit = screen.getByRole("button", { name: "驗證並繼續" });
    expect(submit).toBeDisabled();

    await user.type(input, "12a34567");
    expect(input).toHaveValue("123456");
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    expect(mocks.verifyPhoneOtpAction).toHaveBeenCalledWith({
      code: "123456",
      locale: "zh-HK",
    });
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/customer"),
    );
  });
});
