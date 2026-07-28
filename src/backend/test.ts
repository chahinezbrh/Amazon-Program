
//to test the createDb functions and if the migrations work
// src/backend/test-db.ts
import { getRepoDb } from "./db/createRepoDb"; // adjust path to match your actual file location

async function main() {
  const db = getRepoDb("test-repo");
  console.log("Database client created successfully");

  // try a simple query to confirm the tables actually exist
  const functions = await db.functionRecord.findMany();
  console.log("Functions in db:", functions);
}

main()
  .catch((err) => console.error("Error:", err))
  .finally(() => process.exit());