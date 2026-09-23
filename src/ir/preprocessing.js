/**
 * preprocessing.js — Query and Document Preprocessing for Information Retrieval
 *
 * JavaScript port of the original Python preprocessing.py module.
 * Performs the NLP pipeline fundamental to the TF-IDF based retrieval system:
 *
 * 1. Lowercase conversion
 * 2. Tokenization (splitting text into individual words)
 * 3. Punctuation removal
 * 4. Stop-word removal (removing common words like 'the', 'is', 'for')
 * 5. Stemming (reducing words to their root form via Porter Stemmer)
 *
 * Note: The Python version used NLTK's WordNetLemmatizer. In JavaScript,
 * we use a Porter Stemmer instead — for TF-IDF/IR purposes both produce
 * equivalent retrieval quality by ensuring query-document term matching.
 */

import { STOP_WORDS } from './stopwords.js';

/**
 * Porter Stemmer — reduces English words to their root/stem form.
 *
 * Examples: "running" → "run", "shoes" → "shoe", "comfortable" → "comfort"
 *
 * This is a simplified but effective implementation of the Porter Stemming
 * algorithm, widely used in Information Retrieval systems.
 */
function porterStem(word) {
  if (word.length <= 2) return word;

  // Step 1a: SSES → SS, IES → I, SS → SS, S →
  if (word.endsWith('sses')) {
    word = word.slice(0, -2);
  } else if (word.endsWith('ies')) {
    word = word.slice(0, -2);
  } else if (!word.endsWith('ss') && word.endsWith('s')) {
    word = word.slice(0, -1);
  }

  // Step 1b: Handle -eed, -ed, -ing
  if (word.endsWith('eed')) {
    const stem = word.slice(0, -3);
    if (measureConsonantVowel(stem) > 0) {
      word = word.slice(0, -1); // → -ee
    }
  } else if (word.endsWith('ed') && hasVowel(word.slice(0, -2))) {
    word = word.slice(0, -2);
    word = step1bCleanup(word);
  } else if (word.endsWith('ing') && hasVowel(word.slice(0, -3))) {
    word = word.slice(0, -3);
    word = step1bCleanup(word);
  }

  // Step 1c: Y → I when there is a vowel in stem
  if (word.endsWith('y') && hasVowel(word.slice(0, -1))) {
    word = word.slice(0, -1) + 'i';
  }

  // Step 2: Map double suffixes to single
  const step2Suffixes = {
    'ational': 'ate', 'tional': 'tion', 'enci': 'ence', 'anci': 'ance',
    'izer': 'ize', 'abli': 'able', 'alli': 'al', 'entli': 'ent',
    'eli': 'e', 'ousli': 'ous', 'ization': 'ize', 'ation': 'ate',
    'ator': 'ate', 'alism': 'al', 'iveness': 'ive', 'fulness': 'ful',
    'ousness': 'ous', 'aliti': 'al', 'iviti': 'ive', 'biliti': 'ble',
  };

  for (const [suffix, replacement] of Object.entries(step2Suffixes)) {
    if (word.endsWith(suffix)) {
      const stem = word.slice(0, -suffix.length);
      if (measureConsonantVowel(stem) > 0) {
        word = stem + replacement;
      }
      break;
    }
  }

  // Step 3: Handle -icate, -ative, -alize, etc.
  const step3Suffixes = {
    'icate': 'ic', 'ative': '', 'alize': 'al', 'iciti': 'ic',
    'ical': 'ic', 'ful': '', 'ness': '',
  };

  for (const [suffix, replacement] of Object.entries(step3Suffixes)) {
    if (word.endsWith(suffix)) {
      const stem = word.slice(0, -suffix.length);
      if (measureConsonantVowel(stem) > 0) {
        word = stem + replacement;
      }
      break;
    }
  }

  // Step 4: Remove suffixes
  const step4Suffixes = [
    'al', 'ance', 'ence', 'er', 'ic', 'able', 'ible', 'ant', 'ement',
    'ment', 'ent', 'ion', 'ou', 'ism', 'ate', 'iti', 'ous', 'ive', 'ize',
  ];

  for (const suffix of step4Suffixes) {
    if (word.endsWith(suffix)) {
      const stem = word.slice(0, -suffix.length);
      if (measureConsonantVowel(stem) > 1) {
        if (suffix === 'ion') {
          if (stem.endsWith('s') || stem.endsWith('t')) {
            word = stem;
          }
        } else {
          word = stem;
        }
      }
      break;
    }
  }

  // Step 5a: Remove final 'e'
  if (word.endsWith('e')) {
    const stem = word.slice(0, -1);
    const m = measureConsonantVowel(stem);
    if (m > 1 || (m === 1 && !endsWithCVC(stem))) {
      word = stem;
    }
  }

  // Step 5b: Handle -ll
  if (word.endsWith('ll') && measureConsonantVowel(word.slice(0, -1)) > 1) {
    word = word.slice(0, -1);
  }

  return word;
}

/** Check if a character is a vowel */
function isVowel(ch) {
  return 'aeiou'.includes(ch);
}

/** Check if the stem contains at least one vowel */
function hasVowel(stem) {
  for (const ch of stem) {
    if (isVowel(ch)) return true;
  }
  return false;
}

/** Measure the consonant-vowel sequence count (m value in Porter algorithm) */
function measureConsonantVowel(stem) {
  let m = 0;
  let i = 0;
  const len = stem.length;

  // Skip leading consonants
  while (i < len && !isVowel(stem[i])) i++;

  while (i < len) {
    // Skip vowels
    while (i < len && isVowel(stem[i])) i++;
    if (i < len) {
      m++;
      // Skip consonants
      while (i < len && !isVowel(stem[i])) i++;
    }
  }

  return m;
}

/** Check if stem ends with consonant-vowel-consonant (where final C is not w, x, y) */
function endsWithCVC(stem) {
  const len = stem.length;
  if (len < 3) return false;
  const c1 = stem[len - 3];
  const v = stem[len - 2];
  const c2 = stem[len - 1];
  return !isVowel(c1) && isVowel(v) && !isVowel(c2) && !('wxy'.includes(c2));
}

/** Post step 1b cleanup: handle AT→ATE, BL→BLE, IZ→IZE, double letter, short stem */
function step1bCleanup(word) {
  if (word.endsWith('at') || word.endsWith('bl') || word.endsWith('iz')) {
    return word + 'e';
  }
  const lastTwo = word.slice(-2);
  if (
    lastTwo[0] === lastTwo[1] &&
    !['l', 's', 'z'].includes(lastTwo[0]) &&
    !isVowel(lastTwo[0])
  ) {
    return word.slice(0, -1);
  }
  if (measureConsonantVowel(word) === 1 && endsWithCVC(word)) {
    return word + 'e';
  }
  return word;
}


/**
 * Preprocess a user search query for Information Retrieval.
 *
 * Pipeline:
 *   Input:  "Nike Black Running Shoes for Men"
 *   Step 1: "nike black running shoes for men"         (lowercase)
 *   Step 2: ["nike", "black", "running", "shoes", "for", "men"]  (tokenize)
 *   Step 3: ["nike", "black", "running", "shoes", "for", "men"]  (punctuation removed)
 *   Step 4: ["nike", "black", "running", "shoes", "men"]         (stop words removed)
 *   Step 5: ["nike", "black", "run", "shoe", "men"]              (stemmed)
 *   Output: "nike black run shoe men"
 *
 * @param {string} query - Raw user search query
 * @returns {string} Preprocessed query string with tokens joined by spaces
 */
export function preprocessQuery(query) {
  // Step 1: Convert to lowercase for case-insensitive matching
  query = query.toLowerCase();

  // Step 2 & 3: Tokenize — split on non-alphabetic characters, keep only alpha tokens
  const tokens = query.match(/[a-z]+/g) || [];

  // Step 4: Remove stop words — filter out common English words
  const filtered = tokens.filter(token => !STOP_WORDS.has(token));

  // Step 5: Stemming — reduce words to their root form
  const stemmed = filtered.map(token => porterStem(token));

  // Join tokens back into a single string for TF-IDF vectorization
  return stemmed.join(' ');
}


/**
 * Build a searchable document string from a product's attributes.
 *
 * In Information Retrieval, each product is treated as a "document."
 * We combine multiple fields into a single text representation so that
 * TF-IDF can capture relevance across product name, brand, category,
 * and description.
 *
 * @param {Object} product - Product data with fields product_name, brand, category, description
 * @returns {string} Combined document string for TF-IDF vectorization
 */
export function buildDocument(product) {
  const parts = [
    product.product_name || '',
    product.brand || '',
    product.category || '',
    product.description || '',
  ];
  return parts.join(' ');
}


/**
 * Preprocess a product document string using the same pipeline as queries.
 *
 * Applying the same preprocessing to both queries and documents ensures
 * consistency — a query for "shoes" will match documents containing "shoe"
 * because both go through stemming.
 *
 * @param {string} document - Raw document string (from buildDocument)
 * @returns {string} Preprocessed document string
 */
export function preprocessDocument(document) {
  return preprocessQuery(document);
}
