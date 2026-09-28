import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

declare global {
  var __trackerSql: ReturnType<typeof postgres> | undefined;
}

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  return postgres(connectionString, { max: 10 });
}

// Reuse the connection pool across hot reloads in dev.
const sql = globalThis.__trackerSql ?? createClient();
if (process.env.NODE_ENV !== "production") {
  globalThis.__trackerSql = sql;
}

export const db = drizzle(sql, { schema });
export { sql };
