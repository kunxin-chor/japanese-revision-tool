require("dotenv").config();
const { seedUser } = require("./data/seeder");

// Configurable defaults
const DEFAULT_EMAIL = "admin@example.com";
const DEFAULT_PASSWORD = "password123";

async function runSeeder() {
  try {
    const connectionString = process.env.MONGO_URI;
    if (!connectionString) {
      throw new Error("Missing MONGO_URI in environment or .env");
    }

    const email = process.env.SEED_EMAIL || DEFAULT_EMAIL;
    const password = process.env.SEED_PASSWORD || DEFAULT_PASSWORD;

    console.log("Seeding user...");
    await seedUser(connectionString, { email, password });
    console.log("Seeder completed successfully.");
  } catch (err) {
    console.error("Seeder failed:", err.message);
    process.exit(1);
  }
}

runSeeder();
