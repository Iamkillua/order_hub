# Order Hub

A Windows desktop app (Electron + React) with a Discord-style UI for working through the orders in a Google Sheet.

- **Todo** (default page): unshipped orders with pickup today plus overdue ones, grouped by SKU. Tick an order to write `TRUE` to its `Shipped` cell. Undo is available.
- **Orders**: every order, with Shipped / Unshipped / Overdue tabs, a date filter (pickup or order date), a SKU filter, search, sortable columns and CSV export.
- **Overview**: today's numbers, a 14-day pickup chart, upcoming pickups, SKU distribution, orders by hour, and statuses that need attention.
- **SKU nicknames**: short names for long SKUs. They are stored in a hidden `OrderHub_SKU_Nicknames` tab of the same sheet, so every machine sees the same names.

## 1. Create a Google OAuth client (one time)

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create a project or pick an existing one.
2. **APIs & Services → Library**: enable the **Google Sheets API**.
3. **OAuth consent screen**: choose External, fill in the app name and email, and add yourself (and any teammates) as **test users**.
4. **Credentials → Create credentials → OAuth client ID → Desktop app**.
5. Copy the **Client ID** and **Client secret**. Paste them into Order Hub on first launch. They are stored encrypted on that machine with Windows DPAPI via Electron `safeStorage`.

The app requests only the `spreadsheets` and basic profile scopes. Sign-in runs in your browser using PKCE and a loopback redirect.

## 2. Sheet requirements

The selected tab needs a header row with these columns. Names are matched case-insensitively; other columns are ignored or shown when useful:

`SKU`, `Order ID`, `Order Date`, `Pickup Date`, `Shipped`

Optional: `Qty`, `Product Name`, `Buyer Name`, `Status`. `Shipped` should be a checkbox column or contain `TRUE`/`FALSE`.

> "Shipped today" in Overview means *pickup date is today and Shipped is TRUE*. The sheet has no ship timestamp.

## Development

```powershell
npm install
# If npm skipped Electron's install script (npm 11+/12 may block it):
node node_modules\electron\install.js

npm run dev      # Vite + Electron with hot reload
npm test         # unit tests for parsing, stats and filters (Node 22.18+)
npm run build    # typecheck + production bundle
npm run dist     # build the Windows NSIS installer into release/
```

Browser-only preview with mock data: `npx vite`, then open `http://localhost:5173/`. Add `?mock=setup` to see onboarding, or `?mock=raw` to use the fixture's unshifted dates.

To regenerate the icon: `node scripts/make-icon.mjs`.

## CI / releases

`.github/workflows/build.yml` runs on `windows-latest`. It runs the tests, builds, and packages the installer on every push and PR. The `.exe` is uploaded as a workflow artifact.

To publish a GitHub Release, push a version tag:

```powershell
git tag v1.0.1
git push origin v1.0.1
```

The workflow sets the app version from the tag and attaches the installer to the release.
