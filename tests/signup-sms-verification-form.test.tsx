/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  requestSignupPhoneOtpAction: vi.fn(),
  signUpAction: vi.fn(),
  verifySignupPhoneOtpAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/lib/actions", () => ({
  requestSignupPhoneOtpAction: mocks.requestSignupPhoneOtpAction,
  signUpAction: mocks.signUpAction,
  verifySignupPhoneOtpAction: mocks.verifySignupPhoneOtpAction,
}));

import { SignupForm } from "@/features/auth/signup-form";

describe("signup phone verification form", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requests and verifies an SMS before enabling account creation", async () => {
    const user = userEvent.setup();
    mocks.requestSignupPhoneOtpAction.mockResolvedValue({
      ok: true,
      phone: "91234567",
      maskedPhone: "9*** 4567",
      retryAfterSeconds: 60,
      codeExpiresInSeconds: 300,
      consolePocCode: "123456",
      alreadySent: false,
    });
    mocks.verifySignupPhoneOtpAction.mockResolvedValue({
      ok: true,
      phone: "91234567",
      verifiedAt: "2026-08-30T11:00:00.000Z",
    });

    render(
      <SignupForm
        locale="zh-HK"
        categoryOptions={[]}
        smsVerification={{ enabled: true }}
      />,
    );

    const receiveButton = screen.getByRole("button", {
      name: "收取驗證碼",
    });
    const createButton = screen.getByRole("button", { name: "建立帳戶" });
    expect(receiveButton).toBeDisabled();
    expect(createButton).toBeDisabled();

    await user.type(screen.getByLabelText(/WhatsApp 聯絡電話/), "91234567");
    await waitFor(() => expect(receiveButton).toBeEnabled());
    await user.click(receiveButton);

    expect(mocks.requestSignupPhoneOtpAction).toHaveBeenCalledWith({
      phone: "91234567",
      locale: "zh-HK",
    });
    expect(await screen.findByText("123456")).toBeInTheDocument();
    const codeInput = screen.getByLabelText("6 位數字驗證碼");
    expect(codeInput).toHaveAttribute("autocomplete", "one-time-code");
    await user.type(codeInput, "123456");
    await user.click(screen.getByRole("button", { name: "驗證電話" }));

    expect(mocks.verifySignupPhoneOtpAction).toHaveBeenCalledWith({
      phone: "91234567",
      code: "123456",
      locale: "zh-HK",
    });
    expect(await screen.findByText("電話已驗證")).toBeInTheDocument();
    await waitFor(() => expect(createButton).toBeEnabled());
  });

  it("keeps the original direct signup UI when verification is off", async () => {
    render(
      <SignupForm
        locale="zh-HK"
        categoryOptions={[]}
        smsVerification={{ enabled: false }}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "收取驗證碼" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("密碼最少需要 8 個字元。")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("最少 8 個字元")).toHaveAttribute(
      "minlength",
      "8",
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "建立帳戶" })).toBeEnabled(),
    );
  });
});
