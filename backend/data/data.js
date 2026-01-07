require("dotenv").config();
const { connect } = require("./db");
const { getReviewsByLevelAndType, extractWords, VALID_LEVELS } = require("./bunpro");

async function upsertItems(db, items, masteryLevel, type) {
  const collection = db.collection("reviews");
  let inserted = 0;
  let updated = 0;

  for (const item of items) {
    // Use both bunproId and type to uniquely identify items
    const filter = { bunproId: item.id, type };
    const existing = await collection.findOne(filter);

    if (existing) {
      // Update mastery level if changed
      if (existing.masteryLevel !== masteryLevel) {
        await collection.updateOne(filter, {
          $set: { masteryLevel, updatedAt: new Date() }
        });
        updated++;
      }
    } else {
      // Insert new item
      await collection.insertOne({
        bunproId: item.id,
        type, // "vocab" or "grammar"
        slug: item.slug,
        title: item.title,
        meaning: item.meaning,
        jlptLevel: item.level,
        masteryLevel,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      inserted++;
    }
  }

  return { inserted, updated };
}

async function syncType(db, type) {
  const typeLabel = type === "Vocab" ? "vocab" : "grammar";
  let totalInserted = 0;
  let totalUpdated = 0;

  for (const level of VALID_LEVELS) {
    console.log(`Fetching ${type} at level: ${level}...`);
    const payload = await getReviewsByLevelAndType(level, type);
    const items = extractWords(payload);

    console.log(`  Found ${items.length} ${type} items at ${level}`);

    const { inserted, updated } = await upsertItems(db, items, level, typeLabel);
    totalInserted += inserted;
    totalUpdated += updated;

    console.log(`  Inserted: ${inserted}, Updated: ${updated}`);
  }

  return { totalInserted, totalUpdated };
}

async function syncAllData() {
  const connectionString = process.env.MONGO_URI;
  if (!connectionString) {
    throw new Error("Missing MONGO_URI in environment or .env");
  }

  const dbName = process.env.DB_NAME || "japanese-revision-tool";
  const db = await connect(connectionString, dbName);

  console.log("=== Syncing Vocab ===");
  const vocabStats = await syncType(db, "Vocab");
  console.log(`Vocab sync complete. Inserted: ${vocabStats.totalInserted}, Updated: ${vocabStats.totalUpdated}\n`);

  console.log("=== Syncing Grammar ===");
  const grammarStats = await syncType(db, "Grammar");
  console.log(`Grammar sync complete. Inserted: ${grammarStats.totalInserted}, Updated: ${grammarStats.totalUpdated}\n`);

  console.log("=== All data synced ===");
  return { vocabStats, grammarStats };
}

module.exports = {
  syncAllData,
  syncType,
  upsertItems
};

// Run directly if called as script
if (require.main === module) {
  syncAllData()
    .then(() => {
      console.log("Done.");
      process.exit(0);
    })
    .catch(err => {
      console.error("Sync failed:", err.message);
      process.exit(1);
    });
}
