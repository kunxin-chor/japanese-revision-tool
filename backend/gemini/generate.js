const { ai, MODEL } = require('./index');

async function generateReadingLesson(vocabs, grammar, jlptLevel) {
  if (!vocabs?.length && !grammar?.length) {
    throw new Error("At least one vocab or grammar item is required");
  }

  const vocabList = vocabs.map(v => `- ${v.title} (${v.meaning})`).join('\n');
  const grammarList = grammar.map(g => `- ${g.title} (${g.meaning})`).join('\n');

  const prompt = `You are a Japanese language teacher creating a reading lesson for ${jlptLevel} level students.

Create a short reading passage (5-10 sentences) that uses ALL of the following vocabulary and grammar points naturally.
The rest of the text should match ${jlptLevel} level difficulty.

VOCABULARY TO USE:
${vocabList || '(none)'}

GRAMMAR TO USE:
${grammarList || '(none)'}

IMPORTANT FORMATTING RULES:
1. For ALL kanji in the "japanese" field, include furigana using this syntax: {kanji|reading}
   Example: {食べる|たべる} or {日本語|にほんご}
2. Even single kanji need furigana: {私|わたし}, {今日|きょう}
3. Return the lesson as a JSON object with a "title" and "lines" array

The response object must have:
- "title": a short, descriptive title for the passage in the format "${jlptLevel}: <topic>" (e.g., "N5: A Day at the Park")
- "lines": array of line objects

Each line object must have:
- "japanese": the full Japanese sentence with furigana syntax for all kanji
- "english": the full English translation
- "points": array of vocab/grammar titles used in this line (empty array if none from the provided lists)
- "chunks": array of word/phrase chunks that make up the sentence. Each chunk has:
  - "japanese": the Japanese word/phrase (kanji allowed, no furigana syntax)
  - "hiragana": the hiragana reading
  - "english": the English meaning of this chunk
  The chunks, when concatenated, must form the complete sentence (matching "japanese" without furigana syntax).

Return ONLY the JSON array.`;

  const responseSchema = {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Short descriptive title in format 'JLPT Level: Topic'"
      },
      lines: {
        type: "array",
        items: {
          type: "object",
          properties: {
            japanese: { 
              type: "string", 
              description: "Japanese text with furigana syntax {kanji|reading}" 
            },
            english: { 
              type: "string", 
              description: "English translation" 
            },
            points: { 
              type: "array", 
              items: { type: "string" },
              description: "Array of vocab/grammar titles used in this line"
            },
            chunks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  japanese: { type: "string", description: "Japanese word/phrase (kanji allowed)" },
                  hiragana: { type: "string", description: "Hiragana reading" },
                  english: { type: "string", description: "English meaning of this chunk" }
                },
                required: ["japanese", "hiragana", "english"]
              },
              description: "Word/phrase chunks that form the complete sentence"
            }
          },
          required: ["japanese", "english", "points", "chunks"]
        }
      }
    },
    required: ["title", "lines"]
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

module.exports = {
  generateReadingLesson
};
