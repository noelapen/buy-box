import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractProductIdentity,
  hasProductTitleOverlap,
  isSameBrand,
  isSameCategory,
} from './productIdentity.js';

test('extracts Spaces and bathrobe category from a cart title', () => {
  const identity = extractProductIdentity('Spaces Cotton Bath Robe for Men', []);

  assert.equal(identity.brand, 'Spaces');
  assert.equal(identity.category, 'clothing');
});

test('rejects a different brand even when the category matches', () => {
  const identity = extractProductIdentity('Spaces Cotton Bath Robe for Men', []);
  const candidate = {
    brand: 'Amazon Basics',
    product_name: 'Amazon Basics Cotton Bath Robe for Men',
    category: 'Clothing',
    description: 'Cotton bathrobe',
  };

  assert.equal(isSameBrand(candidate, identity), false);
});

test('accepts same-brand bathrobe candidates with title overlap', () => {
  const identity = extractProductIdentity('Spaces Cotton Bath Robe for Men', []);
  const candidate = {
    brand: 'Spaces',
    product_name: 'Spaces Mens Cotton Bathrobe',
    category: 'Clothing',
    description: 'Soft cotton bath robe for men',
  };

  assert.equal(isSameBrand(candidate, identity), true);
  assert.equal(isSameCategory(candidate, identity), true);
  assert.equal(hasProductTitleOverlap(candidate, identity), true);
});
