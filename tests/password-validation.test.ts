import { describe, expect, it } from "vitest";

import {
  loginSchema,
  passwordResetSchema,
  signupSchema,
} from "@/lib/validation";

const signupInput = {
  fullName: "測試客戶",
  phone: "91234567",
  email: "tester@example.com",
  role: "customer" as const,
  serviceCategoryIds: [],
  locale: "zh-HK" as const,
  dateOfBirth: "1990-01-01",
  securityQuestionId: "first_school" as const,
  securityAnswer: "測試學校",
  password: "12345678",
  confirmPassword: "12345678",
};

describe("user password validation", () => {
  it("accepts any password with at least 8 characters", () => {
    expect(signupSchema.safeParse(signupInput).success).toBe(true);
    expect(
      loginSchema.safeParse({
        identifier: "91234567",
        password: "abcdefgh",
      }).success,
    ).toBe(true);
    expect(
      passwordResetSchema.safeParse({
        phone: "91234567",
        dateOfBirth: "1990-01-01",
        securityQuestionId: "first_school",
        securityAnswer: "測試學校",
        newPassword: "!!!!!!!!",
        confirmPassword: "!!!!!!!!",
      }).success,
    ).toBe(true);
  });

  it("rejects passwords shorter than 8 characters", () => {
    expect(
      signupSchema.safeParse({
        ...signupInput,
        password: "1234567",
        confirmPassword: "1234567",
      }).success,
    ).toBe(false);
    expect(
      loginSchema.safeParse({
        identifier: "91234567",
        password: "1234567",
      }).success,
    ).toBe(false);
  });
});
