import { resetSqliteDb } from "../src/lib/mock/db";

async function main() {
  await resetSqliteDb();
  console.log("Database reset to seeded state.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
