const databaseName = process.env.TARGET_DB;
const username = process.env.APP_USER;
const password = process.env.APP_PASSWORD;

if (!databaseName || !username || !password) {
  throw new Error("TARGET_DB, APP_USER and APP_PASSWORD are required");
}

const target = db.getSiblingDB(databaseName);
const roles = [{ role: "readWrite", db: databaseName }];

if (target.getUser(username)) {
  target.updateUser(username, { pwd: password, roles });
  print(
    JSON.stringify({ database: databaseName, username, action: "updated" }),
  );
} else {
  target.createUser({ user: username, pwd: password, roles });
  print(
    JSON.stringify({ database: databaseName, username, action: "created" }),
  );
}
