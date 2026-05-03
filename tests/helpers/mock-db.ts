import { resetSqliteDb } from "@/lib/mock/db";

export async function resetMockDb() {
  await resetSqliteDb();
}
