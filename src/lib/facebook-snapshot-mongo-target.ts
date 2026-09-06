export type FacebookSnapshotMongoTarget = {
  uri: string;
  database: "hotfix_dev" | "hotfix_prod";
};

/** Runtime reads stay within the database selected for this deployment. */
export function validateFacebookSnapshotMongoTarget(
  uri: string,
  database: string,
): FacebookSnapshotMongoTarget {
  if (database !== "hotfix_dev" && database !== "hotfix_prod") {
    throw new Error("Facebook snapshot database is not supported.");
  }

  let parsed: URL;
  let uriDatabase: string;
  try {
    parsed = new URL(uri);
    uriDatabase = decodeURIComponent(parsed.pathname.replace(/^\//u, ""));
  } catch {
    throw new Error("Facebook snapshot MongoDB URI is invalid.");
  }
  if (
    !["mongodb:", "mongodb+srv:"].includes(parsed.protocol) ||
    !parsed.hostname ||
    parsed.hash ||
    uriDatabase !== database
  ) {
    throw new Error("Facebook snapshot MongoDB URI must match its database.");
  }

  // MongoDB URI option names are case-insensitive. Reject duplicates as well as
  // conflicting values so parser precedence cannot select another database.
  const databaseOptions = new Set<string>();
  for (const [key, value] of parsed.searchParams) {
    const option = key.toLowerCase();
    if (option !== "authsource" && option !== "dbname") continue;
    if (databaseOptions.has(option) || value !== database) {
      throw new Error(
        "Facebook snapshot MongoDB options must match its database.",
      );
    }
    databaseOptions.add(option);
  }

  return { uri, database };
}
