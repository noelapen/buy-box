/* normalizeProduct.js — Normalize products from any source into BUY BOX schema.
 * Schema: { platform, product_name, brand, category, description, price,
 *           rating, review_count, purchase_count, availability, product_url, image }
 */

// ── Google Shopping (SerpAPI) ───────────────────────────────

export function normalizeGoogleProduct(item) {
  const source = (item.source || '').toLowerCase();
  return {
    platform: mapPlatform(source),
    product_name: item.title || 'N/A',
    brand: brandFromTitle(item.title) || 'N/A',
    category: 'N/A',
    description: item.snippet || 'N/A',
    price: parsePrice(item.extracted_price || item.price),
    rating: item.rating != null ? parseFloat(item.rating) : 'N/A',
    review_count: item.reviews != null ? parseInt(item.reviews) : 'N/A',
    purchase_count: 'N/A',
    availability: item.in_stock !== false ? 'In Stock' : 'N/A',
    product_url: item.link || 'N/A',
    image: item.thumbnail || 'N/A',
  };
}

// ── Amazon PA-API 5.0 ───────────────────────────────────────

export function normalizeAmazonProduct(item) {
  const title = item.ItemInfo?.Title?.DisplayValue || 'N/A';
  const offer = item.Offers?.Listings?.[0];
  return {
    platform: 'Amazon',
    product_name: title,
    brand: item.ItemInfo?.ByLineInfo?.Brand?.DisplayValue || brandFromTitle(title) || 'N/A',
    category: item.ItemInfo?.Classifications?.ProductGroup?.DisplayValue || 'N/A',
    description: (item.ItemInfo?.Features?.DisplayValues || []).join('. ') || 'N/A',
    price: offer?.Price?.Amount != null ? parseFloat(offer.Price.Amount) : 'N/A',
    rating: 'N/A',
    review_count: 'N/A',
    purchase_count: 'N/A',
    availability: offer?.Availability?.Message || 'N/A',
    product_url: item.DetailPageURL || 'N/A',
    image: item.Images?.Primary?.Large?.URL || 'N/A',
  };
}

// ── Flipkart Affiliate API ──────────────────────────────────

export function normalizeFlipkartProduct(attrs) {
  const title = attrs.title || attrs.productName || 'N/A';
  const priceObj = attrs.flipkartSellingPrice || attrs.maximumRetailPrice;
  const imgs = attrs.imageUrls || {};
  return {
    platform: 'Flipkart',
    product_name: title,
    brand: attrs.productBrand || brandFromTitle(title) || 'N/A',
    category: attrs.productCategory || 'N/A',
    description: attrs.productDescription || 'N/A',
    price: priceObj?.amount != null ? parseFloat(priceObj.amount) : parsePrice(attrs.price),
    rating: attrs.overallRating != null ? parseFloat(attrs.overallRating) : 'N/A',
    review_count: attrs.reviewCount != null ? parseInt(attrs.reviewCount) : 'N/A',
    purchase_count: 'N/A',
    availability: attrs.inStock === true ? 'In Stock' : attrs.inStock === false ? 'Out of Stock' : 'N/A',
    product_url: attrs.productUrl || 'N/A',
    image: imgs['800x800'] || imgs['400x400'] || Object.values(imgs)[0] || 'N/A',
  };
}

// ── Offline Fallback Dataset ────────────────────────────────

export function normalizeOfflineProduct(item) {
  return {
    platform: item.platform || 'N/A',
    product_name: item.product_name || 'N/A',
    brand: item.brand || 'N/A',
    category: item.category || 'N/A',
    description: item.description || 'N/A',
    price: safeFloat(item.price),
    rating: item.rating !== undefined && item.rating !== '' ? parseFloat(item.rating) : 'N/A',
    review_count: item.review_count !== undefined && item.review_count !== '' ? parseInt(item.review_count) : 'N/A',
    purchase_count: item.purchase_count !== undefined && item.purchase_count !== '' ? parseInt(item.purchase_count) : 'N/A',
    product_url: item.product_url && item.product_url !== 'N/A'
      ? item.product_url : buildSearchUrl(item.platform, item.product_name),
    image: item.image || 'N/A',
  };
}

// ── Helpers ─────────────────────────────────────────────────

function parsePrice(v) {
  if (v == null || v === '' || v === 'N/A') return 'N/A';
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = parseFloat(String(v).replace(/[₹$€£,\s]/g, ''));
  return Number.isFinite(n) ? n : 'N/A';
}

function safeFloat(v) {
  if (v === undefined || v === '' || Number.isNaN(Number(v))) return 'N/A';
  return parseFloat(v);
}

function brandFromTitle(title) {
  if (!title || title === 'N/A') return null;
  const first = title.trim().split(/\s+/)[0];
  return first?.length >= 2 && /^[A-Z]/.test(first) ? first : null;
}

function mapPlatform(src) {
  if (src.includes('amazon')) return 'Amazon';
  if (src.includes('flipkart')) return 'Flipkart';
  if (src.includes('myntra')) return 'Myntra';
  if (src.includes('ajio')) return 'Ajio';
  if (src.includes('meesho')) return 'Meesho';
  if (src.includes('nykaa')) return 'Nykaa';
  if (src.includes('jiomart')) return 'JioMart';
  if (src.includes('croma')) return 'Croma';
  if (src.includes('snapdeal')) return 'Snapdeal';
  if (src.includes('bigbasket')) return 'BigBasket';
  if (src.includes('blinkit')) return 'Blinkit';
  return src || 'N/A';
}

function buildSearchUrl(platform, name) {
  const q = encodeURIComponent(name || 'product');
  const urls = {
    Amazon: `https://www.amazon.in/s?k=${q}`,
    'Amazon.in': `https://www.amazon.in/s?k=${q}`,
    Flipkart: `https://www.flipkart.com/search?q=${q}`,
    Myntra: `https://www.myntra.com/${q}`,
    Meesho: `https://www.meesho.com/search/${q}`,
    Ajio: `https://www.ajio.com/search/?text=${q}`,
    Nykaa: `https://www.nykaa.com/search/?q=${q}`,
    Blinkit: `https://www.blinkit.com/search?query=${q}`,
    BigBasket: `https://www.bigbasket.com/ps/?q=${q}`,
    'Tata Neu': `https://www.tatacliq.com/search/?text=${q}`,
  };
  return urls[platform] || 'N/A';
}
