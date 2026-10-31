# Design — Order Hub

**World:** Discord (pinned by the brief). Dark chat chrome is repurposed for dispatch work: a server rail, a channel sidebar, and messages grouped by SKU. **Mode:** Operate. Scanability beats expression; brand lives in details such as the blurple accents, mention badges and the parcel motif.

## Tokens (`src/styles.css :root`)

| Role | Token | Value |
|---|---|---|
| Rail / titlebar / inputs | `--bg-rail`, `--bg-input` | #1e1f22 |
| Sidebar | `--bg-side` | #2b2d31 |
| Main canvas | `--bg-main` | #313338 |
| Panels / user bar | `--bg-panel` | #232428 |
| Selected channel | `--bg-mod-selected` | #404249 |
| Text / strong / secondary / muted | `--text…` | #dbdee1 / #f2f3f5 / #b5bac1 / #949ba4 |
| Primary action, focus, progress | `--blurple` | #5865f2 |
| Shipped, success, add | `--green` | #23a55a |
| Overdue, destructive, mention badge | `--red` | #f23f43 |
| Non-"New" status, warnings | `--yellow` | #f0b232 |

**Type:** Segoe UI Variable (Text/Display), 15px/1.375 body. **Cascadia Mono** is used for order IDs and SKUs, which are always copyable. Headers use weight, not size jumps. Section dividers are small caps in Discord's style, used only where Discord uses them (channel categories, form labels).

**Motion:** `--ease-out` (expo-out), 120–200ms, on opacity, transform and colour only. There are no layout transitions. Respects `prefers-reduced-motion`.

## Structure

- **Rail** (72px): home logo, the sheet as a "server" with initials, a selection pill and an unshipped badge, and a green "+" that opens settings.
- **Sidebar** (240px): categories Dispatch (todo, orders) / Insights (overview) / Setup (sku-nicknames, settings). The todo channel shows a red mention count of orders left today. The user panel at the bottom shows sync status.
- **Topbar** (48px): `#` channel name, divider, topic, and right-aligned search or refresh.
- **Setup:** blurple full-bleed with a faint parcel pattern and a centred dark card with a 4-segment step bar. The Windows caption buttons switch to blurple via the `window:titlebar` IPC.

## Components (`src/components`)

- `.msg` (SKU group): avatar swatch, nickname as the author, SKU as the timestamp line, and order `.line` rows below it. Hover reveals the `.msg-actions` toolbar (mark all, unmark all, copy IDs).
- `.line`: `Checkbox` (circle, green when checked, spinner while pending), mono ID, ×qty, lateness or time, and a copy button. Ticked lines stay in place, dimmed with a strikethrough.
- `.divider`: a red "Overdue" or neutral "Pickup today" label, as in Discord's "New messages" divider.
- `SkuChip`: a coloured dot plus the nickname, falling back to the SKU. The colour is stable per SKU, hashed into an 8-colour palette.
- `Toasts`: bottom-centre, with Undo/Retry actions.
- Notice bar (unsaved changes): the Discord settings "Careful — you have unsaved changes" bar. It shakes when navigation is blocked.
- `ParcelArt`: SVG for empty states.

## Rules

- No gradient text, eyebrow labels, coloured left borders or glassmorphism.
- Red means late or destructive only. Green means shipped only. Do not use either colour for decoration.
- Counts are always tabular-nums.
