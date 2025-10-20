import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  try {
    const result = await pool.query("SELECT NOW()");
    console.log("DB connected, current time:", result.rows[0].now);
  } catch (error) {
    console.error("Database connection error:", error);
  } finally {
    await pool.end();
  }
}

main();
