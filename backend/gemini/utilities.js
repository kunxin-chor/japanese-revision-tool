require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const { connect } = require('../data/db');

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});
const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

// Kanji Unicode range: 4E00-9FFF (CJK Unified Ideographs)
function containsKanji(text) {
  return /[\u4E00-\u9FFF]/.test(text);
}

async function getVocabByLevel(db, masteryLevel) {
  const collection = db.collection("reviews");
  return collection.find({
    type: "vocab",
    masteryLevel,
    hiragana: { $exists: false } // Only get items without hiragana yet
  }).toArray();
}

async function getHiraganaFromGemini(items) {
  if (items.length === 0) return [];

  const prompt = `Convert the following Japanese vocabulary words to hiragana. 
For each item, provide the hiragana reading of the "title" field.
Return ONLY the JSON array, no other text.

Input:
${JSON.stringify(items.map(item => ({ _id: item._id.toString(), title: item.title })), null, 2)}`;

  const responseSchema = {
    type: "array",
    items: {
      type: "object",
      properties: {
        _id: { type: "string", description: "The document ID" },
        title: { type: "string", description: "The original text" },
        hiragana: { type: "string", description: "The hiragana reading" }
      },
      required: ["_id", "title", "hiragana"]
    }
  };

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema
    }
  });

  const text = response.text;
  return JSON.parse(text);
}

async function updateVocabWithHiragana(db, hiraganaData) {
  const collection = db.collection("reviews");
  const { ObjectId } = require('mongodb');
  let updated = 0;

  for (const item of hiraganaData) {
    await collection.updateOne(
      { _id: new ObjectId(item._id) },
      { $set: { hiragana: item.hiragana, updatedAt: new Date() } }
    );
    updated++;
  }

  return updated;
}

async function addHiraganaForLevel(masteryLevel) {
  const connectionString = process.env.MONGO_URI;
  if (!connectionString) {
    throw new Error("Missing MONGO_URI in environment or .env");
  }

  const dbName = process.env.DB_NAME || "japanese-revision-tool";
  const db = await connect(connectionString, dbName);

  console.log(`Fetching vocab at level: ${masteryLevel}...`);
  const allVocab = await getVocabByLevel(db, masteryLevel);

  // Filter to only items with kanji
  const vocabWithKanji = allVocab.filter(item => containsKanji(item.title));
  console.log(`Found ${allVocab.length} vocab items, ${vocabWithKanji.length} contain kanji`);

  if (vocabWithKanji.length === 0) {
    console.log("No vocab with kanji to process.");
    return { processed: 0, updated: 0 };
  }

  // Process in batches to avoid token limits
  const BATCH_SIZE = 50;
  let totalUpdated = 0;

  for (let i = 0; i < vocabWithKanji.length; i += BATCH_SIZE) {
    const batch = vocabWithKanji.slice(i, i + BATCH_SIZE);
    console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(vocabWithKanji.length / BATCH_SIZE)} (${batch.length} items)...`);

    const hiraganaData = await getHiraganaFromGemini(batch);
    const updated = await updateVocabWithHiragana(db, hiraganaData);
    totalUpdated += updated;

    console.log(`  Updated ${updated} documents with hiragana`);
  }

  return { processed: vocabWithKanji.length, updated: totalUpdated };
}

async function addHiraganaForAllLevels() {
  const levels = ["beginner", "adept", "seasoned", "expert", "master"];
  const results = {};

  for (const level of levels) {
    console.log(`\n=== Processing ${level} ===`);
    results[level] = await addHiraganaForLevel(level);
  }

  console.log("\n=== Summary ===");
  for (const [level, stats] of Object.entries(results)) {
    console.log(`${level}: processed ${stats.processed}, updated ${stats.updated}`);
  }

  return results;
}

module.exports = {
  containsKanji,
  getVocabByLevel,
  getHiraganaFromGemini,
  updateVocabWithHiragana,
  addHiraganaForLevel,
  addHiraganaForAllLevels
};

// Run directly if called as script
if (require.main === module) {
  const level = process.argv[2];
  if (level) {
    addHiraganaForLevel(level)
      .then(result => {
        console.log("Done.", result);
        process.exit(0);
      })
      .catch(err => {
        console.error("Failed:", err.message);
        process.exit(1);
      });
  } else {
    addHiraganaForAllLevels()
      .then(() => {
        console.log("Done.");
        process.exit(0);
      })
      .catch(err => {
        console.error("Failed:", err.message);
        process.exit(1);
      });
  }
}
