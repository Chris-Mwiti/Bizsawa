// products module — tables: products, product_variants
import { check } from 'k6';
import { login, get, post, put, del, mix, scenario, thresholds, uniq, ensureProductId, liveFirstId } from '../lib/helpers.js';

export const options = { scenarios: scenario('default'), thresholds: thresholds('products') };
export function setup() { return login(); }

export default function (data) {
  if (!data.token) return;
  mix([
    [5, () => {
      const r = get(data, '/products?limit=20', 'products', 'products', 'list-products');
      check(r, { 'list products 2xx': (x) => x.status === 200 });
    }],
    [2, () => {
      // Live pick (NOT the cached fixture — the lifecycle op below deletes its own product)
      const id = liveFirstId(data, '/products?limit=5', ['products', 'data', 'items', null], 'products');
      if (!id) return;
      const r = get(data, `/products/${id}`, 'products', 'products', 'get-product');
      // 404 is possible under load: the parallel lifecycle op deletes products.
      check(r, { 'get product w/o 5xx': (x) => x.status !== 0 && x.status < 500 });
    }],
    [1, () => {
      const r = get(data, '/products?limit=5&search=k6', 'products', 'products', 'search-products');
      check(r, { 'search handled': (x) => x.status !== 0 && x.status < 500 });
    }],
    [2, () => {
      const name = uniq('k6-prod');
      const r = post(data, '/products',
        { name, category: 'Poultry Feed', price: 250, buyingPrice: 180, supplier: 'k6', sku: name },
        'products', 'products', 'create-product');
      check(r, { 'create product handled': (x) => x.status !== 0 && x.status < 500 });
      try {
        const id = r.json('id') || r.json('product.id');
        if (id) {
          // Full-object update: PUT validates name as required
          const u = put(data, `/products/${id}`, { name, category: 'Poultry Feed', price: 260 }, 'products', 'products', 'update-product');
          check(u, { 'update product 2xx': (x) => x.status === 200 });
          const d = del(data, `/products/${id}`, 'products', 'products', 'delete-product');
          check(d, { 'delete product handled': (x) => x.status !== 0 && x.status < 500 });
        }
      } catch (e) { /* create failed — handled above */ }
    }],
  ]);
}
