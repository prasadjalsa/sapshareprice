/**
 * Cloudflare Worker — SAP Share Portfolio Calculator
 * - Serves index.html at /
 * - Proxies SAP price at /api/sap-price
 * Stateless — no data stored, no logs retained.
 */

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

async function fetchFromGoogle() {
  const res = await fetch("https://www.google.com/finance/quote/SAP:ETR", {
    headers: { "User-Agent": UA, "Accept": "text/html" },
  });
  const text = await res.text();
  const match = text.match(/€([1-9][0-9]{1,2}\.[0-9]{2})/);
  if (!match) throw new Error("Price not found in Google Finance page");
  return { price: parseFloat(match[1]), source: "Google Finance" };
}

async function fetchFromYahoo(host = "query1") {
  const url = `https://${host}.finance.yahoo.com/v8/finance/chart/SAP.DE?range=1d&interval=1d&includePrePost=false`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept": "application/json",
      "Referer": "https://finance.yahoo.com",
      "Origin": "https://finance.yahoo.com",
    },
  });
  const data = await res.json();
  const meta  = data?.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice;
  if (!price) throw new Error("Empty price in Yahoo response");
  return {
    price: parseFloat(price),
    source: `Yahoo (${host})`,
    marketState: meta?.marketState || null,   // REGULAR, PRE, POST, CLOSED
  };
}

async function handleSapPrice(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const CACHE_TTL = 300; // 5 minutes
  const cache = caches.default;
  const cacheKey = new Request("https://sap-price-cache/api/sap-price");

  // Return cached price if still fresh
  const cached = await cache.match(cacheKey);
  if (cached) {
    const data = await cached.json();
    const age = Math.round((Date.now() - data.fetched_at) / 1000);
    return new Response(JSON.stringify({ ...data, cached: true, age_seconds: age }), {
      status: 200, headers: CORS,
    });
  }

  // Fetch fresh from sources
  const sources = [
    fetchFromGoogle,
    () => fetchFromYahoo("query1"),
    () => fetchFromYahoo("query2"),
  ];
  const errors = [];
  for (const fn of sources) {
    try {
      const { price, source, marketState } = await fn();
      const payload = { price, source, marketState: marketState || null, cached: false, age_seconds: 0, fetched_at: Date.now() };
      // Store in Cloudflare edge cache for 5 minutes
      await cache.put(cacheKey, new Response(JSON.stringify(payload), {
        headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${CACHE_TTL}` },
      }));
      return new Response(JSON.stringify(payload), { status: 200, headers: CORS });
    } catch (e) {
      errors.push(e.message);
    }
  }
  return new Response(JSON.stringify({ error: errors.join(" | ") }), {
    status: 500, headers: CORS,
  });
}

async function handleSapChart(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const CACHE_TTL  = 300; // 5 minutes — same as price cache
  const cache      = caches.default;
  const cacheKey   = new Request("https://sap-chart-cache/api/sap-chart");

  // Return cached chart if still fresh
  const cached = await cache.match(cacheKey);
  if (cached) {
    const data = await cached.json();
    const age  = Math.round((Date.now() - (data.fetched_at || 0)) / 1000);
    return new Response(JSON.stringify({ ...data, cached: true, age_seconds: age }), {
      status: 200, headers: CORS,
    });
  }

  try {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/SAP.DE?range=1d&interval=5m&includePrePost=false';
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept": "application/json",
        "Referer": "https://finance.yahoo.com",
        "Origin": "https://finance.yahoo.com",
      },
    });
    const data   = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) throw new Error('No chart data');
    const timestamps = result.timestamp || [];
    const quote      = result.indicators?.quote?.[0] || {};
    const closes     = quote.close  || [];
    const highs      = quote.high   || [];
    const lows       = quote.low    || [];
    const opens      = quote.open   || [];
    const meta       = result.meta  || {};
    const prevClose  = meta.chartPreviousClose || null;
    const points     = timestamps
      .map((t, i) => ({ t: t * 1000, p: closes[i] }))
      .filter(pt => pt.p !== null && pt.p !== undefined);
    const validHighs = highs.filter(v => v != null);
    const validLows  = lows.filter(v => v != null);
    const dayHigh    = validHighs.length ? Math.max(...validHighs) : null;
    const dayLow     = validLows.length  ? Math.min(...validLows)  : null;
    const dayOpen    = opens.find(v => v != null) || null;
    // Include current price + market state so /api/sap-price is no longer needed
    const currentPrice = meta.regularMarketPrice || (points.length ? points[points.length-1].p : null);
    const marketState  = meta.marketState || null;

    const payload = {
      points, open: prevClose, dayOpen, dayHigh, dayLow,
      price: currentPrice, source: 'Yahoo', marketState,
      cached: false, age_seconds: 0, fetched_at: Date.now(),
    };
    await cache.put(cacheKey, new Response(JSON.stringify(payload), {
      headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${CACHE_TTL}` },
    }));
    return new Response(JSON.stringify(payload), { status: 200, headers: CORS });
  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: CORS,
    });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/sap-price") {
      return handleSapPrice(request);
    }

    if (url.pathname === "/api/sap-chart") {
      return handleSapChart(request);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return Response.redirect("https://github.com/prasadjalsa/sapshareprice", 302);
  },
};
