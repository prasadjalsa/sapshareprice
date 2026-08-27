#!/usr/bin/env python3
"""
Local server for SAP Share Calculator.
Serves static files AND proxies /api/sap-price.
Sources tried in order: Google Finance (ETR) → Yahoo Finance q1 → Yahoo Finance q2
Caches successful price for 5 minutes to avoid rate limits.

Usage:
    python3 server.py
Then open: http://localhost:8080
"""

import http.server
import urllib.request
import urllib.error
import json
import os
import re
import time

PORT = 8080
CACHE_TTL = 300  # 5 minutes

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"

_cache = {"price": None, "ts": 0, "source": None}


def fetch_from_google():
    """Scrape SAP:ETR price from Google Finance (EUR, Frankfurt)."""
    url = "https://www.google.com/finance/quote/SAP:ETR"
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
    with urllib.request.urlopen(req, timeout=10) as r:
        body = r.read().decode("utf-8", errors="ignore")
    match = re.search(r'€([1-9][0-9]{1,2}\.[0-9]{2})', body)
    if match:
        return float(match.group(1))
    raise ValueError("Price not found in Google Finance page")


def fetch_from_yahoo(host="query1"):
    """Fetch SAP.DE price from Yahoo Finance."""
    url = f"https://{host}.finance.yahoo.com/v8/finance/chart/SAP.DE?range=1d&interval=1d&includePrePost=false"
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "application/json",
        "Referer": "https://finance.yahoo.com",
        "Origin": "https://finance.yahoo.com",
    })
    with urllib.request.urlopen(req, timeout=10) as r:
        data = json.load(r)
    price = data["chart"]["result"][0]["meta"]["regularMarketPrice"]
    if not price:
        raise ValueError("Empty price in Yahoo response")
    return float(price)


def fetch_sap_price():
    """Try all sources in order, return (price, source) or raise."""
    sources = [
        ("Google Finance", fetch_from_google),
        ("Yahoo (q1)",     lambda: fetch_from_yahoo("query1")),
        ("Yahoo (q2)",     lambda: fetch_from_yahoo("query2")),
    ]
    errors = []
    for name, fn in sources:
        try:
            price = fn()
            print(f"  SAP price fetched from {name}: €{price}")
            return price, name
        except Exception as e:
            errors.append(f"{name}: {e}")
            print(f"  {name} failed: {e}")
    raise RuntimeError(" | ".join(errors))


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/api/sap-price":
            self._proxy_sap()
        elif self.path == "/api/sap-chart":
            self._proxy_chart()
        elif self.path == "/api/info":
            self._json(200, {"dir": os.getcwd()})
        else:
            super().do_GET()

    def _proxy_chart(self):
        # Try 1m interval first, fall back to 5m
        for interval in ["1m", "5m"]:
            try:
                url = f"https://query1.finance.yahoo.com/v8/finance/chart/SAP.DE?range=1d&interval={interval}&includePrePost=false"
                req = urllib.request.Request(url, headers=FETCH_HEADERS)
                with urllib.request.urlopen(req, timeout=10) as resp:
                    data = json.load(resp)
                result     = data["chart"]["result"][0]
                timestamps = result.get("timestamp", [])
                quote      = result["indicators"]["quote"][0]
                closes     = quote.get("close", [])
                highs      = quote.get("high",  [])
                lows       = quote.get("low",   [])
                opens      = quote.get("open",  [])
                meta       = result.get("meta", {})
                prev_close = meta.get("chartPreviousClose")
                points = [{"t": t * 1000, "p": c}
                          for t, c in zip(timestamps, closes)
                          if c is not None]
                valid_highs   = [h for h in highs if h is not None]
                valid_lows    = [l for l in lows  if l is not None]
                day_open      = next((o for o in opens if o is not None), None)
                day_high      = max(valid_highs) if valid_highs else None
                day_low       = min(valid_lows)  if valid_lows  else None
                current_price = meta.get("regularMarketPrice") or (points[-1]["p"] if points else None)
                market_state  = meta.get("marketState")
                self._json(200, {
                    "points": points, "open": prev_close,
                    "dayOpen": day_open, "dayHigh": day_high, "dayLow": day_low,
                    "price": current_price, "source": f"Yahoo ({interval})",
                    "marketState": market_state, "interval": interval,
                    "cached": False, "age_seconds": 0,
                })
                return
            except Exception as e:
                if interval == "5m":
                    self._json(500, {"error": str(e)})

    def _proxy_sap(self):
        now = time.time()
        age = int(now - _cache["ts"])

        # Return fresh cache
        if _cache["price"] and age < CACHE_TTL:
            self._json(200, {
                "price": _cache["price"],
                "source": _cache["source"],
                "cached": True,
                "age_seconds": age,
            })
            return

        # Fetch fresh
        try:
            price, source = fetch_sap_price()
            _cache["price"] = price
            _cache["ts"] = now
            _cache["source"] = source
            self._json(200, {"price": price, "source": source, "cached": False, "age_seconds": 0})
        except Exception as e:
            if _cache["price"]:
                # Return stale cache rather than nothing
                self._json(200, {
                    "price": _cache["price"],
                    "source": _cache["source"],
                    "cached": True,
                    "stale": True,
                    "age_seconds": age,
                })
            else:
                self._json(500, {"error": str(e)})

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        if len(args) > 1 and args[1] not in ("200", "304"):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    print(f"SAP Portfolio server → http://localhost:{PORT}")
    print("Price sources: Google Finance → Yahoo q1 → Yahoo q2 (with 5-min cache)")
    print("Press Ctrl+C to stop.\n")
    with http.server.HTTPServer(("", PORT), Handler) as httpd:
        httpd.serve_forever()
