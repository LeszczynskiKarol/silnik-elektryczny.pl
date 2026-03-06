/**
 * lib/rebuild-webhook.ts (lub .js)
 *
 * Dodaj do backendu silniki-elektryczne.com.pl
 * Wywołuj po:
 *   - Zamówieniu (order created/paid)
 *   - Zmianie stocku (stock update)
 *   - Dodaniu/usunięciu produktu
 *   - Zmianie ceny
 *
 * Debounce wbudowany — jeśli build już trwa, Lambda go nie duplikuje.
 */

const REBUILD_URL = process.env.SILNIK_REBUILD_URL || ""; // Lambda Function URL
const REBUILD_SECRET = process.env.SILNIK_REBUILD_SECRET || "";

let lastTrigger = 0;
const MIN_INTERVAL_MS = 60_000; // Min 60s między triggerami (client-side debounce)

export async function triggerSiteRebuild(reason: string, productSlug?: string) {
  if (!REBUILD_URL) return; // Nie skonfigurowano — skip

  // Client-side debounce
  const now = Date.now();
  if (now - lastTrigger < MIN_INTERVAL_MS) {
    console.log(
      `[rebuild-webhook] Skipped — last trigger ${Math.round((now - lastTrigger) / 1000)}s ago`,
    );
    return;
  }
  lastTrigger = now;

  try {
    const res = await fetch(REBUILD_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Secret": REBUILD_SECRET,
      },
      body: JSON.stringify({
        reason,
        productSlug,
        timestamp: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(5000), // 5s timeout — fire and forget
    });

    const data = await res.json();
    console.log(`[rebuild-webhook] ${reason}:`, data.message || data.error);
  } catch (err: any) {
    // Fire and forget — nie blokuj głównego flow
    console.error(`[rebuild-webhook] Failed:`, err.message);
  }
}
