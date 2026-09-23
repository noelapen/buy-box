import { preprocessQuery } from './preprocessing.js';

const CATEGORY_ALIASES = {
  footwear: ['shoe', 'shoes', 'sneaker', 'sneakers', 'footwear', 'boot', 'boots'],
  clothing: ['robe', 'bathrobe', 'bath', 'shirt', 'tshirt', 'dress', 'jacket', 'jeans', 'clothing', 'apparel'],
  beauty: ['shampoo', 'conditioner', 'cream', 'lipstick', 'foundation', 'beauty', 'skincare'],
  electronics: ['phone', 'mobile', 'laptop', 'watch', 'headphone', 'earbud', 'electronics'],
  grocery: ['tea', 'coffee', 'rice', 'grocery', 'food'],
};

function normalize(value) {
  return preprocessQuery(String(value || ''));
}

function tokens(value) {
  return new Set(normalize(value).split(' ').filter(Boolean));
}

function hasAny(set, values) {
  return values.some(value => set.has(normalize(value)));
}

export function extractProductIdentity(query, candidates = []) {
  const queryTokens = tokens(query);
  const knownBrands = [...new Set(candidates
    .map(candidate => String(candidate.brand || '').trim())
    .filter(brand => brand && brand.toLowerCase() !== 'n/a'))];

  const brand = knownBrands
    .filter(candidateBrand => queryTokens.size > 0 && normalize(query).includes(normalize(candidateBrand)))
    .sort((left, right) => right.length - left.length)[0]
    || extractLeadingBrand(query);

  const category = Object.entries(CATEGORY_ALIASES)
    .find(([, aliases]) => hasAny(queryTokens, aliases))?.[0] || '';

  const productTokens = new Set(queryTokens);
  for (const token of tokens(brand)) productTokens.delete(token);

  return {
    brand,
    category,
    productTokens,
    queryTokens,
  };
}

function extractLeadingBrand(query) {
  const firstWord = String(query || '').trim().match(/^([A-Za-z][A-Za-z0-9&-]*)/)?.[1] || '';
  const genericWords = new Set(['the', 'mens', 'men', 'womens', 'women', 'kids', 'bath', 'cotton', 'new']);
  return firstWord && !genericWords.has(firstWord.toLowerCase()) ? firstWord : '';
}

export function isSameBrand(product, identity) {
  return Boolean(identity.brand)
    && normalize(product.brand) === normalize(identity.brand);
}

export function isSameCategory(product, identity) {
  if (!identity.category) return true;

  const productTokens = tokens(`${product.product_name} ${product.category} ${product.description}`);
  const aliases = CATEGORY_ALIASES[identity.category] || [];
  return hasAny(productTokens, aliases);
}

export function hasProductTitleOverlap(product, identity) {
  const productTokens = tokens(`${product.product_name} ${product.description}`);
  const meaningfulTokens = [...identity.productTokens].filter(token => token.length > 2);
  return meaningfulTokens.some(token => productTokens.has(token));
}
