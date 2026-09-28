import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { logger } from "@/lib/logger";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const sql = postgres(connectionString, { max: 1 });
  const db = drizzle(sql);

  logger.info("running migrations", { database: connectionString.replace(/:[^:@]*@/, ":***@") });
  await migrate(db, { migrationsFolder: "./db/migrations" });
  logger.info("migrations complete");

  await sql.end();
}

main().catch((error) => {
  logger.error("migration failed", { error: String(error) });
  process.exit(1);
});
