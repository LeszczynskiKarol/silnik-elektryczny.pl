const BACKEND = "https://api.silniki-elektryczne.com.pl";
export const LAMBDA = "https://vos9dl4ovl.execute-api.eu-north-1.amazonaws.com";
export const MAIN_SHOP = "https://www.silniki-elektryczne.com.pl";

const EXCLUDED = new Set([
  "motoreduktory",
  "pompy",
  "wentylatory-przemyslowe",
  "akcesoria",
  "skup-silnikow",
]);
const MOTOR_SLUGS = new Set([
  "trojfazowe",
  "jednofazowe",
  "z-hamulcem",
  "pierscieniowe",
  "dwubiegowe",
  "silniki-elektryczne",
]);

function isMotor(p: any): boolean {
  const cats = p.categories || [];
  if (!cats.length) return false;
  if (cats.some((c: any) => EXCLUDED.has(c.category?.slug || c.slug || "")))
    return false;
  return cats.some((c: any) => {
    const s = c.category?.slug || c.slug || "";
    return MOTOR_SLUGS.has(s) || s.startsWith("silniki-elektryczne-");
  });
}

function isEligible(p: any): boolean {
  if (p.condition !== "uzywany") return false;
  if (!p.marketplaces?.ownStore?.active) return false;
  if (!p.marketplaces?.ownStore?.slug) return false;
  if (p.stock < 1) return false;
  return isMotor(p);
}

let _cached: any[] | null = null;

async function fetchAllMotors(): Promise<any[]> {
  if (_cached) return _cached;
  const res = await fetch(`${BACKEND}/api/products?limit=2000&page=1`);
  const data = await res.json();
  const all = data.data?.products || data.data || [];
  _cached = all.filter(isEligible).map((p: any) => {
    // Normalizuj moc do liczby
    if (p.power?.value != null) {
      const s = String(p.power.value).replace(/kW/gi,'').replace(',','.').trim();
      const n = parseFloat(s);
      if (!isNaN(n)) p.power.value = n;
    }
    return p;
  });
  return _cached!;
}

export async function getMotors(page = 1, perPage = 24) {
  const all = await fetchAllMotors();
  const start = (page - 1) * perPage;
  return {
    data: {
      products: all.slice(start, start + perPage),
      total: all.length,
      page,
      perPage,
      pages: Math.ceil(all.length / perPage),
    },
  };
}

export async function getMotor(slug: string) {
  const res = await fetch(`${BACKEND}/api/shop/product/${slug}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.success) return null;
  // Sprawdź eligibility rozszerzoną (silniki + pompy + wentylatory)
  const p = data.data.product;
  if (p.condition !== 'uzywany') return null;
  if (!p.marketplaces?.ownStore?.active) return null;
  if (!p.marketplaces?.ownStore?.slug) return null;
  if (p.stock < 1) return null;
  const cats = p.categories || [];
  const EXCL = new Set(['akcesoria','skup-silnikow']);
  if (cats.some((c: any) => EXCL.has(c.category?.slug || c.slug || ''))) return null;
  const ALLOWED = new Set(['trojfazowe','jednofazowe','z-hamulcem','pierscieniowe','dwubiegowe','silniki-elektryczne','pompy','wentylatory-przemyslowe']);
  const ok = cats.some((c: any) => { const s = c.category?.slug || c.slug || ''; return ALLOWED.has(s) || s.startsWith('silniki-elektryczne-'); });
  if (!ok) return null;
  return data;
}

export async function getAllMotorSlugs(): Promise<string[]> {
  // Musi zawierać WSZYSTKIE produkty sklepu — silniki + pompy + wentylatory
  const all = await fetchAllShopRaw();
  return all.map((p: any) => p.marketplaces.ownStore.slug).filter(Boolean);
}

export function formatPrice(price: number | string): string {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    minimumFractionDigits: 0,
  }).format(Number(price));
}

export function getImageUrl(product: any): string {
  return product.mainImage || product.images?.[0] || "/placeholder.webp";
}

export async function fetchAllMotorsRaw(): Promise<any[]> {
  const res = await fetch(`${BACKEND}/api/products?limit=2000&page=1`);
  const data = await res.json();
  const all = data.data?.products || data.data || [];
  return all.filter((p: any) => {
    if (p.condition !== "uzywany") return false;
    if (!p.marketplaces?.ownStore?.active) return false;
    if (!p.marketplaces?.ownStore?.slug) return false;
    if (p.stock < 1) return false;
    const cats = p.categories || [];
    if (!cats.length) return false;
    const EXCL = new Set([
      "motoreduktory",
      "pompy",
      "wentylatory-przemyslowe",
      "akcesoria",
      "skup-silnikow",
    ]);
    if (cats.some((c: any) => EXCL.has(c.category?.slug || c.slug || "")))
      return false;
    const MOTOR = new Set([
      "trojfazowe",
      "jednofazowe",
      "z-hamulcem",
      "pierscieniowe",
      "dwubiegowe",
      "silniki-elektryczne",
    ]);
    return cats.some((c: any) => {
      const s = c.category?.slug || c.slug || "";
      return MOTOR.has(s) || s.startsWith("silniki-elektryczne-");
    });
  }).map((p: any) => {
    if (p.power?.value != null) {
      const s = String(p.power.value).replace(/kW/gi,'').replace(',','.').trim();
      const n = parseFloat(s);
      if (!isNaN(n) && n > 0) p.power.value = n; else p.power.value = null;
    }
    return p;
  });
}

// Fetch wszystkich produktów włącznie z pompami i wentylatorami (dla stron kategorii)
export async function fetchAllShopRaw(): Promise<any[]> {
  const res = await fetch(`${BACKEND}/api/products?limit=2000&page=1`);
  const data = await res.json();
  const all = data.data?.products || data.data || [];
  return all.filter((p: any) => {
    if (p.condition !== 'uzywany') return false;
    if (!p.marketplaces?.ownStore?.active) return false;
    if (!p.marketplaces?.ownStore?.slug) return false;
    if (p.stock < 1) return false;
    const cats = p.categories || [];
    if (!cats.length) return false;
    const EXCL = new Set(['akcesoria','skup-silnikow']);
    if (cats.some((c: any) => EXCL.has(c.category?.slug || c.slug || ''))) return false;
    const ALLOWED = new Set(['trojfazowe','jednofazowe','z-hamulcem','pierscieniowe','dwubiegowe','silniki-elektryczne','pompy','wentylatory-przemyslowe']);
    return cats.some((c: any) => {
      const s = c.category?.slug || c.slug || '';
      return ALLOWED.has(s) || s.startsWith('silniki-elektryczne-');
    });
  }).map((p: any) => {
    if (p.power?.value != null) {
      const s = String(p.power.value).replace(/kW/gi,'').replace(',','.').trim();
      const n = parseFloat(s);
      if (!isNaN(n) && n > 0) p.power.value = n; else p.power.value = null;
    }
    return p;
  });
}
