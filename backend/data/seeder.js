const { connect } = require("./db");

async function seedUser(connectionString, { email, password }) {
  if (!email || !password) {
    throw new Error("Both email and password are required to seed a user");
  }

  // Extract dbname from connection string or use a default
  const dbname = process.env.DB_NAME || "japanese-revision-tool";
  const db = await connect(connectionString, dbname);
  const users = db.collection("users");

  // Optional: prevent duplicate emails
  const existing = await users.findOne({ email });
  if (existing) {
    console.log(`User with email "${email}" already exists. Skipping insert.`);
    return existing;
  }

  const result = await users.insertOne({ email, password });
  console.log(`Seeded user with email "${email}" (insertedId: ${result.insertedId})`);

  return result;
}

module.exports = {
  seedUser
};
