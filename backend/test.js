require("dotenv").config();
const { syncAllData, saveReadingLesson } = require("./data/data");
const { generateReadingLesson } = require("./gemini/generate");
const { recommendItems, updatePracticeStats } = require("./data/srs");

const TEST_USER_ID = process.env.TEST_USER_ID;

async function testSRS() {
  console.log("\n=== Testing SRS-based lesson recommendation ===");
  console.log("User ID:", TEST_USER_ID);

  // Step 1: Recommend items using SRS
  console.log("\n--- Step 1: Select vocab and grammar via SRS ---");
  const { vocabs, grammar } = await recommendItems({
    userId: TEST_USER_ID,
    jlptLevel: "N5",
    vocabCount: 3,
    grammarCount: 2
  });

  if (vocabs.length === 0 && grammar.length === 0) {
    console.log("No items found. Make sure you have synced data for this user.");
    return;
  }

  // Step 2: Generate lesson with Gemini
  console.log("\n--- Step 2: Generate lesson with Gemini ---");
  const lesson = await generateReadingLesson(vocabs, grammar, "N5");
  console.log("Generated title:", lesson.title);
  console.log("Lines count:", lesson.lines.length);

  // Step 3: Save lesson to database
  console.log("\n--- Step 3: Save lesson to database ---");
  const savedLesson = await saveReadingLesson({
    jlptLevel: "N5",
    lines: lesson.lines,
    vocabs,
    grammar,
    title: lesson.title
  });
  console.log("Saved lesson _id:", savedLesson._id);

  // Step 4: Update practice stats for the items used
  console.log("\n--- Step 4: Update practice stats ---");
  const allItemIds = [
    ...vocabs.map(v => v._id),
    ...grammar.map(g => g._id)
  ];
  const updateResults = await updatePracticeStats(TEST_USER_ID, allItemIds);
  console.log("Updated practice stats:");
  updateResults.forEach(r => {
    console.log(`  - ${r.title}: practiceCount=${r.practiceCount}, nextPractice=${r.nextPractice.toISOString().split('T')[0]}`);
  });

  console.log("\n=== SRS test complete ===");
}

async function main() {
  // Uncomment if you want to re-sync from Bunpro first
  // await syncAllData(TEST_USER_ID);

  await testSRS();
}

main().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});