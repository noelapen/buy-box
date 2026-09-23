/**
 * normalizeProduct.js — Product Schema Normalizer
 *
 * Normalizes products from any data source (eBay API, offline JSON, etc.)
 * into the unified BUY BOX schema. Missing fields are set to "N/A".
 * Values are never invented.
 *
 * Normalized Schema:
 *   { platform, product_name, brand, description, price, rating,
 *     review_count, purchase_count, availability, product_url, image }
 */


/**
 * Normalize an eBay Browse API search result item into our schema.
 *
 * @param {Object} item - eBay API item from /search endpoint
 * @returns {Object} Normalized product object
 */
export function normalizeEbayProduct(item) {
  return {
    platform: 'eBay',
    product_name: item.title || 'N/A',
    brand: extractEbayBrand(item) || 'N/A',
    category: item.categories?.[0]?.categoryName || 'N/A',
    description: buildEbayDescription(item),
    price: parseEbayPrice(item),
    rating: 'N/A', // eBay search results don't include ratings
    review_count: 'N/A',
    availability: 'N/A',
    purchase_count: 'N/A',
    availability: item.availability || 'N/A',
    product_url: item.itemWebUrl || 'N/A',
    image: item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl || 'N/A',
  };
}


/**
 * Normalize a product from the offline JSON fallback dataset.
 * The offline data already matches our schema closely.
 *
 * @param {Object} item - Product from products.json
 * @returns {Object} Normalized product object
 */
export function normalizeOfflineProduct(item) {
  return {
    platform: item.platform || 'N/A',
    product_name: item.product_name || 'N/A',
    brand: item.brand || 'N/A',
    category: item.category || 'N/A',
    description: item.description || 'N/A',
    price: item.price !== undefined && item.price !== '' && !Number.isNaN(Number(item.price))
      ? parseFloat(item.price)
      : 'N/A',
    rating: item.rating !== undefined && item.rating !== '' ? parseFloat(item.rating) : 'N/A',
    review_count: item.review_count !== undefined && item.review_count !== '' ? parseInt(item.review_count) : 'N/A',
    purchase_count: item.purchase_count !== undefined && item.purchase_count !== '' ? parseInt(item.purchase_count) : 'N/A',
    product_url: item.product_url && item.product_url !== 'N/A'
      ? item.product_url
      : buildSearchUrl(item.platform, item.product_name),
    image: item.image || 'N/A',
  };
}

function buildSearchUrl(platform, productName) {
  const query = encodeURIComponent(productName || 'product');
  const urls = {
    Amazon: `https://www.amazon.in/s?k=${query}`,
    Flipkart: `https://www.flipkart.com/search?q=${query}`,
    Myntra: `https://www.myntra.com/${query}`,
    Ajio: `https://www.ajio.com/search/?text=${query}`,
    Walmart: `https://www.walmart.com/search?q=${query}`,
    Target: `https://www.target.com/s?searchTerm=${query}`,
    eBay: `https://www.ebay.com/sch/i.html?_nkw=${query}`,
  };
  return urls[platform] || 'N/A';
}


// ============================================================
// Helper functions for eBay normalization
// ============================================================

function extractEbayBrand(item) {
  // Try to extract brand from localizedAspects
  if (item.localizedAspects) {
    const brandAspect = item.localizedAspects.find(
      a => a.name?.toLowerCase() === 'brand'
    );
    if (brandAspect) return brandAspect.value;
  }
  return null;
}

function buildEbayDescription(item) {
  const parts = [];
  if (item.shortDescription) parts.push(item.shortDescription);
  if (item.condition) parts.push(`Condition: ${item.condition}`);
  if (item.itemLocation?.city) parts.push(`Ships from: ${item.itemLocation.city}`);
  return parts.length > 0 ? parts.join('. ') : 'N/A';
}

function parseEbayPrice(item) {
  const priceStr = item.price?.value;
  if (priceStr) {
    const parsed = parseFloat(priceStr);
    if (!isNaN(parsed)) return parsed;
  }
  return 'N/A';
}
