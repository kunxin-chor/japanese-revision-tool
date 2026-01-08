require("dotenv").config();
const { connect } = require("./db");

/**
 * Calculate priority score for an item based on SRS state
 * Higher score = more likely to be selected
 */
function calculatePriority(item, now = new Date()) {
  // Never practiced = highest priority
  if (!item.lastPracticed) {
    return 1000;
  }

  const lastPracticed = new Date(item.lastPracticed);
  const nextPractice = item.nextPractice ? new Date(item.nextPractice) : null;

  // Overdue items get high priority
  if (nextPractice && nextPractice <= now) {
    const daysOverdue = (now - nextPractice) / (1000 * 60 * 60 * 24);
    return 500 + Math.min(daysOverdue * 10, 200);
  }

  // Not yet due - lower priority, weighted by how soon
  if (nextPractice) {
    const daysUntilDue = (nextPractice - now) / (1000 * 60 * 60 * 24);
    return Math.max(0, 100 - daysUntilDue * 5);
  }

  // Fallback for items with lastPracticed but no nextPractice
  return 50;
}

/**
 * Fisher-Yates shuffle
 */
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Select items for a lesson using SRS priority
 * @param {string} userId - User ID
 * @param {string} jlptLevel - JLPT level (e.g., "N5", "N4")
 * @param {string} type - "vocab" or "grammar"
 * @param {number} count - Number of items to select
 * @returns {Promise<Array>} Selected items
 */
async function selectItemsForLesson(userId, jlptLevel, type, count) {
  const connectionString = process.env.MONGO_URI;
  if (!connectionString) {
    throw new Error("Missing MONGO_URI in environment or .env");
  }

  const dbName = process.env.DB_NAME || "japanese-revision-tool";
  const db = await connect(connectionString, dbName);

  const now = new Date();

  const items = await db.collection("reviews").find({
    userId,
    jlptLevel,
    type
  }).toArray();

  if (items.length === 0) {
    return [];
  }

  // Score and sort by priority
  const scored = items.map(item => ({
    ...item,
    priority: calculatePriority(item, now)
  }));

  scored.sort((a, b) => b.priority - a.priority);

  // Take top candidates (3x requested), then randomize within that tier
  const topTierSize = Math.min(count * 3, scored.length);
  const topTier = scored.slice(0, topTierSize);
  shuffleArray(topTier);

  // Return requested count
  return topTier.slice(0, Math.min(count, topTier.length));
}

/**
 * Update practice stats after a lesson is saved
 * Uses SM-2 inspired interval calculation
 * @param {string} userId - User ID
 * @param {Array<ObjectId|string>} itemIds - Array of item _ids that were practiced
 */
async function updatePracticeStats(userId, itemIds) {
  const connectionString = process.env.MONGO_URI;
  if (!connectionString) {
    throw new Error("Missing MONGO_URI in environment or .env");
  }

  const dbName = process.env.DB_NAME || "japanese-revision-tool";
  const db = await connect(connectionString, dbName);
  const collection = db.collection("reviews");

  const now = new Date();
  const results = [];

  for (const itemId of itemIds) {
    const item = await collection.findOne({ _id: itemId, userId });

    if (!item) {
      console.warn(`Item ${itemId} not found for user ${userId}`);
      continue;
    }

    // SM-2 inspired interval calculation
    const currentEase = item.practiceEase || 2.5;
    const currentInterval = item.practiceInterval || 1;
    const practiceCount = (item.practiceCount || 0) + 1;

    let newInterval;
    if (practiceCount === 1) {
      newInterval = 1;  // 1 day
    } else if (practiceCount === 2) {
      newInterval = 3;  // 3 days
    } else {
      newInterval = Math.round(currentInterval * currentEase);
    }

    // Cap interval at 180 days
    newInterval = Math.min(newInterval, 180);

    // Ease stays constant (could add quality rating later)
    const newEase = Math.max(1.3, currentEase);

    const nextPractice = new Date(now.getTime() + newInterval * 24 * 60 * 60 * 1000);

    await collection.updateOne(
      { _id: itemId },
      {
        $set: {
          practiceCount,
          lastPracticed: now,
          practiceInterval: newInterval,
          practiceEase: newEase,
          nextPractice,
          updatedAt: now
        }
      }
    );

    results.push({
      itemId,
      title: item.title,
      practiceCount,
      newInterval,
      nextPractice
    });
  }

  return results;
}

/**
 * Recommend a lesson by selecting vocab and grammar via SRS
 * @param {Object} options
 * @param {string} options.userId - User ID
 * @param {string} options.jlptLevel - JLPT level (e.g., "N5")
 * @param {number} options.vocabCount - Number of vocab items (default 3)
 * @param {number} options.grammarCount - Number of grammar items (default 2)
 * @returns {Promise<Object>} { vocabs, grammar } selected items
 */
async function recommendItems({ userId, jlptLevel, vocabCount = 3, grammarCount = 2 }) {
  if (!userId) {
    throw new Error("userId is required");
  }
  if (!jlptLevel) {
    throw new Error("jlptLevel is required");
  }

  console.log(`Selecting ${vocabCount} vocab and ${grammarCount} grammar for ${jlptLevel}...`);

  const vocabs = await selectItemsForLesson(userId, jlptLevel, "vocab", vocabCount);
  const grammar = await selectItemsForLesson(userId, jlptLevel, "grammar", grammarCount);

  console.log(`Selected ${vocabs.length} vocab items:`, vocabs.map(v => v.title));
  console.log(`Selected ${grammar.length} grammar items:`, grammar.map(g => g.title));

  return { vocabs, grammar };
}

module.exports = {
  calculatePriority,
  selectItemsForLesson,
  updatePracticeStats,
  recommendItems
};
