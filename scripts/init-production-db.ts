import {
  closeMongoConnection,
  initializeMongoProductionDb,
} from "../src/lib/mock/mongo-db";

async function main() {
  const result = await initializeMongoProductionDb();
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeMongoConnection();
  });
