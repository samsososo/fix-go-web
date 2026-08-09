import { spawn } from "node:child_process";

const [envFile, executable, ...args] = process.argv.slice(2);

if (!envFile || !executable) {
  throw new Error("Usage: run-with-env.mjs <env-file> <command> [...args]");
}

process.loadEnvFile(envFile);

const child = spawn(executable, args, {
  env: process.env,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exitCode = code ?? 1;
});
