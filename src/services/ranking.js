/** Comparison sorting and runtime badge assignment. Retrieval owns relevance scores. */

export const SORT_OPTIONS = {
  BEST_MATCH: 'best_match',
  LOWEST_PRICE: 'lowest_price',
  HIGHEST_RATING: 'highest_rating',
  MOST_REVIEWS: 'most_reviews',
  MOST_PURCHASED: 'most_purchased',
};

function numericValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function compareNumbers(left, right) {
  const leftNumber = numericValue(left);
  const rightNumber = numericValue(right);
  if (leftNumber === null && rightNumber === null) return 0;
  if (leftNumber === null) return 1;
  if (rightNumber === null) return -1;
  return leftNumber - rightNumber;
}

export function sortProducts(products, sortBy = SORT_OPTIONS.BEST_MATCH) {
  const sorted = [...products];
  switch (sortBy) {
    case SORT_OPTIONS.LOWEST_PRICE:
      sorted.sort((a, b) => compareNumbers(a.price, b.price));
      break;
    case SORT_OPTIONS.HIGHEST_RATING:
      sorted.sort((a, b) => compareNumbers(b.rating, a.rating) || compareNumbers(b.relevance_score, a.relevance_score));
      break;
    case SORT_OPTIONS.MOST_REVIEWS:
      sorted.sort((a, b) => compareNumbers(b.review_count, a.review_count));
      break;
    case SORT_OPTIONS.MOST_PURCHASED:
      sorted.sort((a, b) => compareNumbers(b.purchase_count, a.purchase_count));
      break;
    case SORT_OPTIONS.BEST_MATCH:
    default:
      sorted.sort((a, b) => compareNumbers(b.relevance_score, a.relevance_score)
        || compareNumbers(a.price, b.price)
        || compareNumbers(b.rating, a.rating)
        || compareNumbers(b.review_count, a.review_count));
      break;
  }
  return sorted;
}

function addBadgeForMinimum(products, field, badge) {
  const values = products.map(product => numericValue(product[field])).filter(value => value !== null);
  if (!values.length) return;
  const match = products.find(product => numericValue(product[field]) === Math.min(...values));
  if (match) match.badges.push(badge);
}

function addBadgeForMaximum(products, field, badge, tieBreaker) {
  const available = products.filter(product => numericValue(product[field]) !== null);
  if (!available.length) return;
  available.sort((a, b) => compareNumbers(b[field], a[field]) || compareNumbers(b[tieBreaker], a[tieBreaker]));
  available[0].badges.push(badge);
}

export function rankProducts(products) {
  if (!products?.length) return [];
  const rankedProducts = sortProducts(products).map(product => ({ ...product, badges: [] }));
  rankedProducts[0].badges.push('BEST MATCH');
  rankedProducts[0].badges.push('BEST CHOICE');
  addBadgeForMinimum(rankedProducts, 'price', 'LOWEST PRICE');
  addBadgeForMaximum(rankedProducts, 'rating', 'HIGHEST RATED', 'review_count');
  return rankedProducts;
}
