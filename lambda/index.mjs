const BACKEND_URL = process.env.BACKEND_URL;
const SITE_URL = 'https://www.silnik-elektryczny.pl';

const EXCLUDED_SLUGS = new Set(['motoreduktory','pompy','wentylatory-przemyslowe','akcesoria','skup-silnikow']);
const MOTOR_SLUGS = new Set(['trojfazowe','jednofazowe','z-hamulcem','pierscieniowe','dwubiegowe','silniki-elektryczne']);

function isMotor(product) {
  const cats = product.categories || [];
  if (!cats.length) return false;
  if (cats.some(c => EXCLUDED_SLUGS.has(c.slug || c.category?.slug || ''))) return false;
  return cats.some(c => {
    const s = c.slug || c.category?.slug || '';
    return MOTOR_SLUGS.has(s) || s.startsWith('silniki-elektryczne-');
  });
}

function isEligible(p) {
  if (p.condition !== 'uzywany') return false;
  if (!p.marketplaces?.ownStore?.active) return false;
  if (!p.marketplaces?.ownStore?.slug) return false;
  if (p.stock < 1) return false;
  return isMotor(p);
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export const handler = async (event) => {
  const path = event.rawPath || '/';
  const method = event.requestContext?.http?.method || 'GET';
  const params = new URLSearchParams(event.rawQueryString || '');

  if (method === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    if (path === '/products' || path === '/') {
      const page = parseInt(params.get('page') || '1');
      const perPage = parseInt(params.get('perPage') || '24');
      const res = await fetch(`${BACKEND_URL}/api/products?limit=2000&page=1`);
      const data = await res.json();
      const all = (data.data?.products || data.data || []).filter(isEligible);
      const start = (page - 1) * perPage;
      return {
        statusCode: 200,
        headers: { ...CORS, 'Cache-Control': 'public, max-age=300' },
        body: JSON.stringify({
          success: true,
          data: { products: all.slice(start, start + perPage), total: all.length, page, perPage, pages: Math.ceil(all.length / perPage) },
        }),
      };
    }

    const productMatch = path.match(/^\/products\/(.+)$/);
    if (productMatch && method === 'GET') {
      const slug = productMatch[1];
      const res = await fetch(`${BACKEND_URL}/api/shop/product/${slug}`);
      const data = await res.json();
      if (!data.success || !isEligible(data.data.product))
        return { statusCode: 404, headers: CORS, body: JSON.stringify({ success: false, error: 'Nie znaleziono' }) };
      return { statusCode: 200, headers: { ...CORS, 'Cache-Control': 'public, max-age=60' }, body: JSON.stringify(data) };
    }

    if (path === '/create-checkout' && method === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { items, shipping, subtotal, shippingCost, total, totalWeight, paymentMethod = 'prepaid' } = body;

      if (!items?.length || !shipping?.email) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ success: false, error: 'Brak danych' }) };
      }

      // Walidacja COD — max 575 kg
      if (paymentMethod === 'cod' && totalWeight > 575) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ success: false, error: 'Za pobraniem niedostępne dla wagi powyżej 575 kg' }) };
      }

      // Weryfikuj produkty
      for (const item of items) {
        const res = await fetch(`${BACKEND_URL}/api/shop/product/${item.slug}`);
        const data = await res.json();
        if (!data.success || !isEligible(data.data.product))
          return { statusCode: 400, headers: CORS, body: JSON.stringify({ success: false, error: `Produkt "${item.name}" niedostępny` }) };
      }

      const orderRes = await fetch(`${BACKEND_URL}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items,
          shipping,
          subtotal,
          shippingCost,
          total,
          totalWeight,
          paymentMethod,           // ← przekazujemy dokładnie to co przyszło
          returnUrl: SITE_URL,
        }),
      });

      const orderData = await orderRes.json();
      if (!orderData.success)
        return { statusCode: 400, headers: CORS, body: JSON.stringify(orderData) };

      const order = orderData.data.order;

      // COD — brak Stripe, zwracamy orderId bezpośrednio
      if (paymentMethod === 'cod') {
        return {
          statusCode: 200,
          headers: { ...CORS, 'Cache-Control': 'no-cache' },
          body: JSON.stringify({
            success: true,
            data: {
              orderId: order.id,
              orderNumber: order.orderNumber,
            },
          }),
        };
      }

      // Prepaid — Stripe checkout
      return {
        statusCode: 200,
        headers: { ...CORS, 'Cache-Control': 'no-cache' },
        body: JSON.stringify({
          success: true,
          data: {
            checkoutUrl: orderData.data.checkoutUrl,
            orderId: order.id,
            orderNumber: order.orderNumber,
          },
        }),
      };
    }

    if (path === '/check-stock' && method === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const res = await fetch(`${BACKEND_URL}/api/shop/check-stock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { statusCode: 200, headers: { ...CORS, 'Cache-Control': 'no-cache' }, body: await res.text() };
    }

    return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'Not found' }) };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
