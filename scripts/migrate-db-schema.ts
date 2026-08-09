import {
  closeMongoConnection,
  finalizeMongoSchemaMigration,
  inspectMongoSchema,
} from "../src/lib/mock/mongo-db";

async function main() {
  const before = await inspectMongoSchema();
  const result = await finalizeMongoSchemaMigration();
  const after = await inspectMongoSchema();

  console.log(
    JSON.stringify(
      {
        before: before.names,
        dropped: result.dropped,
        after: after.names,
        counts: after.counts,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeMongoConnection();
  });
