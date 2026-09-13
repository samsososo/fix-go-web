import { expect, it } from "vitest";
import { testEnvironment } from "../scripts/run-tests.mjs";

it("requires a dedicated test database and account and rejects DEV or PROD targets", () => {
  const config = {
    MONGODB_DATABASE: "hotfix_test",
    MONGODB_URI:
      "mongodb://hotfix_test_app:synthetic@localhost/hotfix_test?authSource=hotfix_test",
  };
  expect(testEnvironment(config)).toMatchObject({
    ...config,
    NODE_ENV: "test",
    ENABLE_DATABASE_SEEDING: "true",
  });
  for (const database of ["hotfix_dev", "hotfix_prod"]) {
    expect(() =>
      testEnvironment({ ...config, MONGODB_DATABASE: database }),
    ).toThrow();
    expect(() =>
      testEnvironment({
        ...config,
        MONGODB_URI: config.MONGODB_URI.replace(
          "/hotfix_test?",
          `/${database}?`,
        ),
      }),
    ).toThrow();
  }
  expect(() =>
    testEnvironment({
      ...config,
      MONGODB_URI: config.MONGODB_URI.replace(
        "hotfix_test_app",
        "hotfix_dev_app",
      ),
    }),
  ).toThrow();
  expect(() =>
    testEnvironment({
      ...config,
      MONGODB_URI: config.MONGODB_URI + "&authsource=hotfix_prod",
    }),
  ).toThrow();
});
