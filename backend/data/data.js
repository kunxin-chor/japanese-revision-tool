require("dotenv").config();
const { connect } = require("./db");
const { getReviewsByLevelAndType, extractWords, VALID_LEVELS } = require("./bunpro");

async function upsertItems(db, items, masteryLevel, type, userId) {
  const collection = db.collection("reviews");
  let inserted = 0;
  let updated = 0;

  for (const item of items) {
    // Use bunproId, type, and userId to uniquely identify items
    const filter = { bunproId: item.id, type, userId };
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
        userId,
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

async function syncType(db, type, userId) {
  const typeLabel = type === "Vocab" ? "vocab" : "grammar";
  let totalInserted = 0;
  let totalUpdated = 0;

  for (const level of VALID_LEVELS) {
    console.log(`Fetching ${type} at level: ${level}...`);
    const payload = await getReviewsByLevelAndType(level, type);
    const items = extractWords(payload);

    console.log(`  Found ${items.length} ${type} items at ${level}`);

    const { inserted, updated } = await upsertItems(db, items, level, typeLabel, userId);
    totalInserted += inserted;
    totalUpdated += updated;

    console.log(`  Inserted: ${inserted}, Updated: ${updated}`);
  }

  return { totalInserted, totalUpdated };
}

async function saveReadingLesson({ jlptLevel, lines, vocabs, grammar, title }) {
  const connectionString = process.env.MONGO_URI;
  if (!connectionString) {
    throw new Error("Missing MONGO_URI in environment or .env");
  }

  const dbName = process.env.DB_NAME || "japanese-revision-tool";
  const db = await connect(connectionString, dbName);
  const collection = db.collection("lessons");

  const lesson = {
    type: "reading",
    jlptLevel,
    title: title || null,
    lines,
    vocabs: vocabs.map(v => ({
      _id: v._id || null,
      bunproId: v.bunproId || v.id || null,
      title: v.title,
      meaning: v.meaning,
      hiragana: v.hiragana || null
    })),
    grammar: grammar.map(g => ({
      _id: g._id || null,
      bunproId: g.bunproId || g.id || null,
      title: g.title,
      meaning: g.meaning
    })),
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const result = await collection.insertOne(lesson);
  console.log(`Saved reading lesson (jlptLevel: ${jlptLevel}) with _id: ${result.insertedId}`);

  return { ...lesson, _id: result.insertedId };
}

async function syncAllData(userId) {
  if (!userId) {
    throw new Error("userId is required for syncAllData");
  }

  const connectionString = process.env.MONGO_URI;
  if (!connectionString) {
    throw new Error("Missing MONGO_URI in environment or .env");
  }

  const dbName = process.env.DB_NAME || "japanese-revision-tool";
  const db = await connect(connectionString, dbName);

  console.log(`=== Syncing Vocab for user ${userId} ===`);
  const vocabStats = await syncType(db, "Vocab", userId);
  console.log(`Vocab sync complete. Inserted: ${vocabStats.totalInserted}, Updated: ${vocabStats.totalUpdated}\n`);

  console.log(`=== Syncing Grammar for user ${userId} ===`);
  const grammarStats = await syncType(db, "Grammar", userId);
  console.log(`Grammar sync complete. Inserted: ${grammarStats.totalInserted}, Updated: ${grammarStats.totalUpdated}\n`);

  console.log("=== All data synced ===");
  return { vocabStats, grammarStats };
}

module.exports = {
  syncAllData,
  syncType,
  upsertItems,
  saveReadingLesson
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
