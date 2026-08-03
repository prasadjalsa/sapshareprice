SAP SHARE PORTFOLIO CALCULATOR
================================
A local web app to track your SAP share purchases, calculate profit/loss
in INR, and fetch live SAP share prices (Frankfurt/XETRA in EUR) with
EUR to INR conversion.


REQUIREMENTS
------------
- Python 3.7 or later
- A modern browser (Chrome, Firefox, Safari, Edge)
- Internet connection (for live price fetch only)


FILES
-----
  index.html              - The web app (open in your browser)
  server.py               - Local Python server (serves app + fetches SAP price)
  SAP Share overall.csv   - Your share data (load via app on first run)
  README.txt              - This file


MACOS SECURITY WARNING
----------------------
When you download server.py via a browser, macOS may block it with a
"Malicious Script Blocked" message. This is a false positive caused by
macOS Gatekeeper quarantining browser-downloaded scripts.

To fix it, run this once in terminal before starting the server:

    xattr -c server.py

Then start the server normally:

    python3 server.py

Alternatively: Right-click server.py in Finder -> Open -> click Open
when macOS asks for confirmation.


SETUP & RUNNING
---------------

Step 1 - Put all files in the same folder
  Place index.html, server.py, and SAP Share overall.csv together, e.g.:

    /Users/yourname/SAP Share Calculator/
        index.html
        server.py
        SAP Share overall.csv

Step 2 - Start the server
  Open a terminal and run:

    cd "/path/to/SAP Share Calculator"
    python3 server.py

  You should see:
    SAP Portfolio server -> http://localhost:8080
    Price cache TTL: 5 minutes (avoids Yahoo 429 errors)
    Press Ctrl+C to stop.

Step 3 - Open the app
  Open your browser and go to:

    http://localhost:8080

  NOTE: Do NOT open index.html directly as a file — always use localhost:8080.
  Opening as a file will break localStorage persistence.

Step 4 - Load your CSV (first time only)
  Click "Load CSV file" and select SAP Share overall.csv.
  Data is saved to browser localStorage and loads automatically on future visits.


FEATURES
--------
LIVE PRICES
- Live SAP price     : Fetches SAP.DE (Frankfurt/XETRA EUR) via server proxy
                       Sources tried: Google Finance -> Yahoo q1 -> Yahoo q2
                       Cached 5 minutes to avoid rate limits
                       Countdown timer on Refresh button shows when ready
- Auto-refresh       : Check "Auto (15 min)" to refresh prices automatically
- EUR to INR rate    : Fetched from frankfurter.dev
- Apply Prices button: Manually type a price and apply it to all calculations

KPI TILES
- Shares Held        : Total qty split by Own SAP and Move SAP
- Total Cost Basis   : Total purchase cost in INR with avg cost/share
- Current Value      : Live value at current SAP price and exchange rate
- Unrealised P&L     : INR gain/loss with % — click to view cumulative chart
- P&L % by Date      : Latest lot P&L % — click to view per-lot chart
- Break-even         : SAP EUR price and EUR/INR rate to break even
- Realised Cap Gain  : Total gain from all SELL / STC* transactions
- Total P&L          : Realised + Unrealised combined

CURRENTLY HELD SHARES TABLE
- Filter by Plan Type : Own SAP / Own SAP Dividend / Move SAP / Move SAP Dividend
- Filter by Status   : All / Profit / Loss / Hold
- Sort by date       : Click Acq. Date header to toggle oldest/newest first
- Pagination         : 10 per page default, selectable 10/20/40/50
- Edit mode          : Click Edit to edit Acq Date, Plan Type, Buy Price,
                       Buy Rate (with EUR/INR flip toggle), Quantity inline
- Delete rows        : Delete button per row in edit mode
- Save / Cancel      : Save writes to localStorage, Cancel discards changes

TRANSACTION HISTORY
- Collapsible        : Click header to expand/collapse (collapsed by default)
- Search and filter  : Search any field, filter by STCG/LTCG
- Edit mode          : Edit Sell Date, Sell Price EUR/INR, Qty, Capital Gain
- Delete rows        : Delete button per row in edit mode

DATA MANAGEMENT
- Add new rows       : Add purchases/awards with EUR/INR rate flip toggle
- Log Sell (FIFO)    : Record a sell — oldest lots consumed first
- Merge CSV          : Load new CSV to add only new dates (no duplicates)
- Export CSV         : Downloads as SAP_SharePrice_analyzed_at_DD-MM-YY_HH-MM.csv
- Clear Storage      : Wipe all browser data (with confirmation)
- Share App button   : Downloads index.html + server.py + blank CSV + README
                       (no personal data included)


DATA & PRIVACY
--------------
- All portfolio data is stored in YOUR browser's localStorage only
- No personal data is sent anywhere
- The only external calls are:
    1. Google Finance / Yahoo Finance  (SAP share price)
    2. frankfurter.dev                 (EUR to INR rate)
- server.py runs entirely on your local machine
- Data survives browser restarts but is tied to one browser profile
- Recommended: Export CSV periodically as a backup


TROUBLESHOOTING
---------------
Problem: "Malicious Script Blocked" on macOS
Fix:     Run this once in terminal: xattr -c server.py
         Then run python3 server.py as normal.
         (macOS flags browser-downloaded scripts — the file is safe)

Problem: "No saved data found"
Fix:     Load your CSV via the file picker

Problem: "SAP price fetch failed" or 429 error
Fix:     Google/Yahoo is rate-limited. Wait for the countdown timer
         to finish, then click Refresh Prices again.

Problem: Page shows nothing / blank screen
Fix:     Make sure server.py is running and you opened http://localhost:8080
         (not the HTML file directly)

Problem: Data gone after browser restart
Fix:     localStorage persists per browser profile. If you switched browsers
         or cleared browser data, reload the CSV once via the file picker.

Problem: Port 8080 already in use
Fix:     Edit server.py line "PORT = 8080" to another port e.g. 8081,
         then open http://localhost:8081


STOPPING THE SERVER
-------------------
Press Ctrl+C in the terminal where server.py is running.
