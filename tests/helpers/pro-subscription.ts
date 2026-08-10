import { MongoClient } from "mongodb";

import { env } from "@/lib/env";
import { ensureProSubscription } from "@/lib/mock/db";
import type {
  ProSubscription,
  SubscriptionAccessStatus,
} from "@/lib/subscription-policy";

let testClientPromise: Promise<MongoClient> | null = null;

function getTestClient() {
  if (!env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required for subscription tests.");
  }

  testClientPromise ??= new MongoClient(env.MONGODB_URI).connect();
  return testClientPromise;
}

export async function setProSubscriptionAccess(
  proId: string,
  accessStatus: SubscriptionAccessStatus,
  overrides: Partial<ProSubscription> = {},
) {
  await ensureProSubscription(proId);
  const client = await getTestClient();
  await client
    .db(env.MONGODB_DATABASE)
    .collection<{ _id: string }>("proSubscriptions")
    .updateOne(
      { _id: proId },
      {
        $set: {
          accessStatus,
          updatedAt: new Date().toISOString(),
          ...overrides,
        },
      },
    );
}

export async function closeProSubscriptionTestClient() {
  const clientPromise = testClientPromise;
  testClientPromise = null;
  if (clientPromise) {
    await (await clientPromise).close();
  }
}
