import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  getSmsVerificationConfig,
  setSmsVerificationEnabled,
  withDb,
} from "@/lib/mock/db";
import {
  defaultSmsVerificationConfig,
  resolveSmsVerificationConfig,
} from "@/lib/sms-verification-config";
import { closeMockDb, resetMockDb } from "./helpers/mock-db";

describe("SMS verification database configuration", () => {
  beforeEach(async () => {
    await resetMockDb();
  });

  afterAll(async () => {
    await closeMockDb();
  });

  it("starts disabled with the safe POC defaults", async () => {
    await expect(getSmsVerificationConfig()).resolves.toMatchObject({
      ...defaultSmsVerificationConfig,
      effectiveEnabled: false,
      forceOff: false,
      updatedBy: "system",
    });
  });

  it("stores the switch and administrator audit fields in MongoDB", async () => {
    const updated = await setSmsVerificationEnabled({
      enabled: true,
      updatedBy: "admin_1",
    });

    expect(updated).toMatchObject({
      enabled: true,
      effectiveEnabled: true,
      updatedBy: "admin_1",
    });
    expect(updated.updatedAt).toBeTruthy();
    await expect(getSmsVerificationConfig()).resolves.toMatchObject({
      enabled: true,
      effectiveEnabled: true,
      updatedBy: "admin_1",
    });
  });

  it("survives unrelated marketplace state writes", async () => {
    await setSmsVerificationEnabled({
      enabled: true,
      updatedBy: "admin_1",
    });

    await withDb((db) => {
      db.notifications.push({
        id: "notification_config_test",
        userId: "user_admin_1",
        title: "Config preservation",
        body: "Unrelated marketplace write",
        read: false,
        createdAt: new Date().toISOString(),
      });
    });

    await expect(getSmsVerificationConfig()).resolves.toMatchObject({
      enabled: true,
      effectiveEnabled: true,
      updatedBy: "admin_1",
    });
  });
});

describe("SMS verification fail-safe resolution", () => {
  it("falls back to disabled when a database document is malformed", () => {
    expect(
      resolveSmsVerificationConfig(
        {
          ...defaultSmsVerificationConfig,
          enabled: true,
          maxAttempts: 0,
        },
        false,
      ),
    ).toMatchObject({
      ...defaultSmsVerificationConfig,
      effectiveEnabled: false,
    });
  });

  it("lets the environment emergency switch override an enabled DB value", () => {
    expect(
      resolveSmsVerificationConfig(
        { ...defaultSmsVerificationConfig, enabled: true },
        true,
      ),
    ).toMatchObject({
      enabled: true,
      effectiveEnabled: false,
      forceOff: true,
    });
  });
});
