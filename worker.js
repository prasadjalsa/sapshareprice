/**
 * Cloudflare Worker — SAP Share Price Proxy
 * Fetches SAP.DE (Frankfurt/XETRA) price from Google Finance / Yahoo Finance.
 * Stateless — no data stored, no logs retained.
 *
 * Deploy at: https://dash.cloudflare.com → Workers & Pages → Create Worker
 * Paste this file, deploy, then update SAP_WORKER_URL in index.html.
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
  const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (!price) throw new Error("Empty price in Yahoo response");
  return { price: parseFloat(price), source: `Yahoo (${host})` };
}

export default {
  async fetch(request) {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    if (url.pathname !== "/api/sap-price") {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404, headers: CORS,
      });
    }

    const sources = [
      fetchFromGoogle,
      () => fetchFromYahoo("query1"),
      () => fetchFromYahoo("query2"),
    ];

    const errors = [];
    for (const fn of sources) {
      try {
        const { price, source } = await fn();
        return new Response(JSON.stringify({ price, source, cached: false, age_seconds: 0 }), {
          status: 200, headers: CORS,
        });
      } catch (e) {
        errors.push(e.message);
      }
    }

    return new Response(JSON.stringify({ error: errors.join(" | ") }), {
      status: 500, headers: CORS,
    });
  },
};
