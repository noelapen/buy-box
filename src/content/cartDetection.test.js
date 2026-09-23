import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCartProductTitles,
  getProductTitle,
  isCartRelatedPage,
  isProductTitleCandidate,
} from './cartDetection.js';

function makeDocument({ title = '', bodyText = '', productTitle = '' }) {
  return {
    title,
    bodyText,
    location: { pathname: '/product' },
    querySelector(selector) {
      if (selector === 'h1') {
        return productTitle ? { textContent: productTitle } : null;
      }
      if (selector === '#productTitle') {
        return productTitle ? { textContent: productTitle } : null;
      }
      if (selector === '[data-testid="product-title"]') {
        return productTitle ? { textContent: productTitle } : null;
      }
      if (selector === 'meta[property="og:title"]') {
        return productTitle ? { getAttribute: () => productTitle } : null;
      }
      return null;
    },
  };
}

test('getProductTitle returns the product title from product pages', () => {
  const doc = makeDocument({ productTitle: 'Love Beauty & Planet Shampoo' });
  assert.equal(getProductTitle(doc), 'Love Beauty & Planet Shampoo');
});

test('getProductTitle ignores cart labels', () => {
  const doc = makeDocument({ productTitle: 'Subtotal' });
  assert.equal(getProductTitle(doc), '');
});

test('cart pages are rejected', () => {
  const doc = { location: { pathname: '/gp/cart' }, title: 'Shopping Cart' };
  assert.equal(isCartRelatedPage(doc), true);
});

test('go-to-cart labels are rejected as product titles', () => {
  assert.equal(isProductTitleCandidate('Go to Cart'), false);
});

test('cart pages still resolve the actual product title from the item link', () => {
  const doc = {
    title: 'Shopping Cart',
    location: { pathname: '/gp/cart/view.html' },
    querySelectorAll(selector) {
      if (selector === 'a[href*="/dp/"]' || selector === 'a[href*="/gp/product/"]' || selector === 'a[href*="/product/"]' || selector === '.sc-product-title a' || selector === '.a-link-normal[href*="/dp/"]' || selector === '[data-asin] a') {
        return [{ textContent: 'The Curl Co SoftHold Curl Cream | For Dry, Frizzy, Wavy, Curly Hair | 2in1 Styling Cream...' }];
      }
      return [];
    },
    querySelector() {
      return null;
    },
  };

  assert.equal(getProductTitle(doc), 'The Curl Co SoftHold Curl Cream | For Dry, Frizzy, Wavy, Curly Hair | 2in1 Styling Cream...');
  assert.deepEqual(getCartProductTitles(doc), [
    'The Curl Co SoftHold Curl Cream | For Dry, Frizzy, Wavy, Curly Hair | 2in1 Styling Cream...',
  ]);
});
