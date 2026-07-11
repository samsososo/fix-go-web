import { closeDb, resetDb } from "@/lib/mock/db";

export async function resetMockDb() {
  await resetDb();
}

export async function closeMockDb() {
  await closeDb();
}
