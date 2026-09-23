export function isCartRelatedPage(doc = document) {
  const path = String(doc.location?.pathname || '').toLowerCase();
  const title = String(doc.title || '').toLowerCase();

  if (/\/(cart|basket|checkout|orders?)\b|\/gp\/cart|\/secure\/checkout/i.test(path)) {
    return true;
  }

  if (/\b(cart|basket|checkout|subtotal|go to cart|proceed to buy)\b/i.test(title)) {
    return true;
  }

  return false;
}

export function isProductTitleCandidate(title) {
  const cleaned = String(title || '').replace(/\s+/g, ' ').trim();

  if (!cleaned || cleaned.length < 4) {
    return false;
  }

  const lower = cleaned.toLowerCase();
  const blocked = [
    'subtotal',
    'shopping cart',
    'your cart',
    'go to cart',
    'proceed to buy',
    'checkout',
    'added to cart',
    'cart subtotal',
  ];

  if (blocked.some(word => lower.includes(word))) {
    return false;
  }

  return true;
}

function readCandidateTitle(value) {
  const cleaned = String(value || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  return isProductTitleCandidate(cleaned) ? cleaned : '';
}

export function getCartProductTitles(doc = document) {
  const selectors = [
    'a[href*="/dp/"]',
    'a[href*="/gp/product/"]',
    'a[href*="/product/"]',
    '.sc-product-title a',
    '.a-link-normal[href*="/dp/"]',
    '[data-asin] a',
  ];
  const titles = [];
  const seen = new Set();

  for (const selector of selectors) {
    const elements = doc.querySelectorAll?.(selector) || [];
    for (const element of elements) {
      const title = readCandidateTitle(element.textContent || element.getAttribute?.('title'));
      if (title && !seen.has(title)) {
        seen.add(title);
        titles.push(title);
      }
    }
  }

  return titles;
}

export function getProductTitle(doc = document) {
  const selectors = [
    '[data-testid="product-title"]',
    '#productTitle',
    'h1',
    'meta[property="og:title"]',
  ];

  for (const selector of selectors) {
    const element = doc.querySelector?.(selector);
    if (!element) continue;

    const directTitle = element.getAttribute?.('content') || element.textContent || '';
    const title = readCandidateTitle(directTitle);
    if (title) return title;
  }

  if (isCartRelatedPage(doc)) {
    const cartTitle = getCartProductTitles(doc)[0];
    if (cartTitle) return cartTitle;
  }

  const documentTitle = readCandidateTitle(doc.title);
  if (documentTitle) {
    return documentTitle;
  }

  return '';
}
