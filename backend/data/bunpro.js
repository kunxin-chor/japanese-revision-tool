const axios = require('axios');
require('dotenv').config();

const TOKEN = process.env.TOKEN;
if (!TOKEN) {
  throw new Error("Missing TOKEN env var. Set TOKEN in your environment or .env file.");
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(minMs = 500, maxMs = 1500) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

function extractWords(payload) {
  const reviews = payload.reviews?.data ?? [];
  const included = payload.reviews?.included ?? [];

  // Build a lookup table: reviewable_id -> vocab object
  const vocabById = Object.fromEntries(
    included.map(item => [
      String(item.id),
      item.attributes
    ])
  );

  return reviews
    .map(review => {
      const reviewableId =
        review.relationships?.reviewable?.data?.id;

      const vocab = vocabById[String(reviewableId)];
      if (!vocab) return null;

      return {
        id: vocab.id,
        slug: vocab.slug,
        title: vocab.title,
        meaning: vocab.meaning,
        level: vocab.level,
        review: {
          streak: review.attributes.streak,
          accuracy: review.attributes.accuracy,
          timesStudied: review.attributes.times_studied,
          nextReview: review.attributes.next_review
        }
      };
    })
    .filter(Boolean);
}


const VALID_LEVELS = ["beginner", "adept", "seasoned", "expert", "master"];
const VALID_TYPES = ["Vocab", "Grammar"];

async function getReviewsByLevelAndType(level, type) {
  if (!VALID_LEVELS.includes(level)) {
    throw new Error(`Invalid level "${level}". Must be one of: ${VALID_LEVELS.join(", ")}`);
  }
  if (!VALID_TYPES.includes(type)) {
    throw new Error(`Invalid type "${type}". Must be one of: ${VALID_TYPES.join(", ")}`);
  }

  const allReviews = [];
  const allIncluded = [];

  let page = 1;
  let totalPages = 1;

  do {
    const response = await axios.get(
      "https://api.bunpro.jp/api/frontend/user_stats/srs_level_details",
      {
        params: {
          level,
          reviewable_type: type,
          page
        },
        headers: {
          accept: "*/*",
          "accept-language": "en-US,en;q=0.9",
          authorization: `Token token=${TOKEN}`,
          "cache-control": "no-cache",
          pragma: "no-cache",
          priority: "u=1, i",
          "sec-ch-ua": "\"Google Chrome\";v=\"143\", \"Chromium\";v=\"143\", \"Not A(Brand\";v=\"24\"",
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": "\"Windows\"",
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-site",
          Referer: "https://bunpro.jp/"
        }
      }
    );

    const data = response.data;

    allReviews.push(...data.reviews.data);
    allIncluded.push(...data.reviews.included);

    totalPages = data.pagy.pages;
    page++;

    // Random delay between requests to avoid flooding the API
    if (page <= totalPages) {
      const delay = randomDelay(500, 1500);
      console.log(`  Waiting ${delay}ms before next request...`);
      await sleep(delay);
    }
  } while (page <= totalPages);

  return {
    reviews: {
      data: allReviews,
      included: allIncluded
    }
  };
}


function shuffleAndChunkWords(words, chunkSize = 20) {
  // shallow copy so we don’t mutate original
  const shuffled = [...words];

  // Fisher–Yates shuffle
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // chunk
  const chunks = [];
  for (let i = 0; i < shuffled.length; i += chunkSize) {
    chunks.push(shuffled.slice(i, i + chunkSize));
  }

  return chunks;
}



module.exports = {
  extractWords, shuffleAndChunkWords, getReviewsByLevelAndType, VALID_LEVELS, VALID_TYPES
}
