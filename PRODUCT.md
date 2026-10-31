# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(Electron desktop app for Windows; renderer is a web UI.)

## Users
A small online seller (V.S.S., selling puja kits on Amazon) and whoever packs orders. They sit at a Windows PC during dispatch, working through the day's pickups and ticking orders off as they are packed and handed over. Assumed (not confirmed): one or a few people, sometimes on different PCs.

## Product Purpose
Order Hub turns the seller's Google Sheet order tracker into a fast daily workspace: what must ship today, what is overdue, and how orders break down by product. Success is that nothing due for pickup is missed and marking an order shipped takes one click, with the sheet staying the single source of truth.

## Positioning
It works directly on the seller's existing Google Sheet — no new database, no migration. Every tick writes back to the sheet's `Shipped` column.

## Operating Context
- Data lives in a Google Sheet with columns: Buyer Name, SKU, Product Name, Qty, Order Date (`31-Oct-2026 21:35`), Order ID (Amazon format `408-9563881-9476348`), Pickup Date (`02-Nov-2026 00:00`), Print Label & Invoice, Printed, Shipped, Length/Width/Height (cm), Weight (g), Pickup Slot, Confirm Pickup, Status.
- Sample export: `VSS Order Tracker Working - Orders.csv` (171 orders, SKUs `KP4001992` and `VSS-DLPK-01`). Product names are long marketing titles, hence nicknames.
- Peak season (Diwali/Dhanteras) means bursts of 50–80 orders per day.

## Capabilities and Constraints
- Sign in with Google OAuth (desktop loopback flow). The user pastes their own OAuth client ID/secret on first run.
- Sheet chosen by pasting its URL, then picking the tab. Only the Sheets scope is requested.
- Todo = unshipped orders whose Pickup Date is today or earlier (overdue). App opens to Todo by default.
- Marking shipped sets only `Shipped` = TRUE; unticking sets FALSE.
- SKU nicknames are stored in a hidden tab (`OrderHub_SKU_Nicknames`) in the same spreadsheet.
- Pages: Todo, Orders (filters: shipped/unshipped, date range, SKU, search), Overview (analytics), SKU nicknames, Settings.
- Windows installer built by GitHub Actions (electron-builder, NSIS).

## Brand Commitments
User asked for a UI "like Discord": dark, left rail + channel-style sidebar + content pane.

## Evidence on Hand
Only the sample CSV. No logo, no brand assets.

## Product Principles
1. The sheet is the truth; the app never holds data the sheet doesn't.
2. Today's dispatch first — overdue and due-today are impossible to miss.
3. One click to ship, instantly reversible.
4. Nicknames over SKUs everywhere a human reads.
