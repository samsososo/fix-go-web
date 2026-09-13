import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { pathToFileURL } from "node:url";

export function testEnvironment(config) {
  const uri = new URL(config.MONGODB_URI);
  if (
    config.MONGODB_DATABASE !== "hotfix_test" ||
    uri.protocol !== "mongodb:" ||
    uri.pathname !== "/hotfix_test" ||
    uri.username !== "hotfix_test_app" ||
    uri.searchParams.get("authSource") !== "hotfix_test" ||
    [...uri.searchParams].some(
      ([key, value]) =>
        ["authsource", "dbname"].includes(key.toLowerCase()) &&
        value !== "hotfix_test",
    )
  ) {
    throw new Error(
      "Tests require the dedicated hotfix_test database and account.",
    );
  }
  return {
    ...process.env,
    ...config,
    NODE_ENV: "test",
    ENABLE_DATABASE_SEEDING: "true",
    ENABLE_DEMO_LOGIN: "true",
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  let testEnv;
  try {
    testEnv = testEnvironment(parseEnv(readFileSync(".env.test", "utf8")));
  } catch {
    console.error(
      "Configure .env.test with the dedicated hotfix_test connection before running tests.",
    );
    process.exit(1);
  }
  const child = spawn(
    process.execPath,
    ["./node_modules/vitest/vitest.mjs", ...process.argv.slice(2)],
    { env: testEnv, stdio: "inherit" },
  );
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => child.kill(signal));
  }
  child.on("error", () => {
    process.exitCode = 1;
  });
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exitCode = code ?? 1;
  });
}
