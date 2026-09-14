# dsh-session-cost

Session cost for the DeepSeek Harness web GUI: a **`sessionCost` projection** derived
from the durable log, rendered as a pill beside the composer statistics strip.

The pill shows the session total (`≈ $0,79`, or `≥` when part of it cannot be priced).
Clicking it opens one thing: the same total over the addends it is made of — the billed
token buckets as money.

```
Costo della sessione           0,794 $
───────────────────────────────────────
Input non in cache             0,079 $
Input in cache                 0,416 $
Output                         0,299 $
```

Nothing else: no commentary, no notes, no per-model or per-tier lines. The rows are the
total's own addends, so they sum to it by construction. A `Scrittura cache` row appears
only for a model whose table actually charges a cache write (DeepSeek publishes none, so
with the shipped table the panel is always these three lines). The figure is marked as a
floor (`≥`) on the pill, never given a number the table cannot support.

## Why the cost is derived rather than read from the API

DeepSeek's API returns **tokens only**: `prompt_tokens`, `prompt_cache_hit_tokens`,
`completion_tokens`, `reasoning_tokens`. `dsh-llm-deepseek` maps exactly those into
`inputTokens` / `cacheReadTokens` / `outputTokens` / `reasoningTokens`, and nothing else.
There is no per-operation price in the response to sum.

The third-party SDK DSH layers over some routes does carry a `cost` field, but DSH
deliberately drops it: `dsh-llm-pi-ai` zeroes `usage.cost` and no consumer reads it. Its
bundled catalog is also stale — it lists DeepSeek V4 Flash at `$0.14 / $0.28` per 1M
input/output while the published rates are `$0.15` / `$0.60` off-peak. Deriving from the
published table is therefore both the only available and the more accurate route.

## The model

Per billed request, in USD per 1M tokens:

```
cost = miss_tokens  x input_rate(tier)
     + hit_tokens   x cache_hit_rate(tier)
     + write_tokens x cache_write_rate(tier)      # DeepSeek publishes none: 0
     + out_tokens   x output_rate(tier)
```

`tier` follows the instant the request was **issued** (the recorded `step/start`, falling
back to the message time). `prices.json` carries the official peak windows: 01:00–04:00
and 06:00–10:00 UTC, Monday–Friday, everything else at half price. Reasoning tokens are
already inside `completion_tokens`, so they are billed once, as output.

The fold stores only **price-independent facts** — token buckets per model and tier. Money
is computed when the view is produced, so editing `prices.json` reprices every session on
its next view: no refold, no cache invalidation, no restart (the file is re-checked within
5 seconds).

Because the persisted checkpoint holds facts and not money, a price change never needs a
`stateVersion` bump. Only a change to the *state shape* does: bump `stateVersion` in
[`lib/index.js`](lib/index.js) and every stored row for this key refolds from the log.

## Updating prices

Edit [`prices.json`](prices.json): `models.<id>.input|cacheHit|output` each carry `peak`
and `offPeak`, and `peak.windowsUtc` / `peak.weekdaysUtc` define the tiers. Model ids not
present in `models` — or reachable through `aliases` — are reported as *unpriced*: their
requests are counted and excluded from the total, and the pill switches to `≥` (or `—`
when nothing at all could be priced). No number is ever invented.

The shipped table was read from
[DeepSeek's Models & Pricing page](https://api-docs.deepseek.com/quick_start/pricing/);
its version, retrieval date, and source URL live in `prices.json` beside the rates, and are
deliberately not shown in the panel.

## What it does not cover

- Requests that were aborted before the provider reported usage (a failed or retried
  attempt that produced no `assistant/message` usage record) are not billed into the total.
- The tier of a long request is the window it started in; a request straddling a boundary
  is not split.
- The projection folds the durable log, so a forked session includes its inherited prefix
  — the same convention `sessionStats` and `tokenUsage` follow.
- Only DeepSeek's published rates are shipped. Any other route stays unpriced until its
  model is added to `prices.json`.

## Where it renders, and why there

The statistics strip is a terminal component (`StatsPills`, the `stats` cell of the
`conversation.composer.dock` list slot) whose figures come from the `sessionStats` and
`tokenUsage` projections; it exposes no per-item seat. This pack therefore registers its
**own** cell in the same dock — the documented additive path ("a fresh id is added beside
the shipped entries") — and then portals its pill **into the shipped row itself**, the
element `StatsPills` marks with `data-composer-stats`. Inside that flex row the pill is a
sibling of the time and usage pills, so the cost reads as a third item on the same line
rather than a line of its own.

The row is located through that published attribute rather than a class name, and only the
pill is inserted: the shipped component keeps rendering its own two pills, so nothing
shipped is replaced, shadowed, or reimplemented. If the attribute ever disappears the pill
degrades to its own row in the same band (`dsc_root`) instead of vanishing — and the
shipped row really is absent for a session before its first billed request, when
`StatsPills` renders nothing at all.

Reusing the shipped `stats` id would instead *replace* the cell, forcing a reimplementation
of shipped UI that a DSH update could silently leave behind.

## The peak-hour widget

A small readout above the sidebar's New-session button: whether the minute you are in is
billed at the peak rate, and the schedule as your own clock shows it.

```
● Fuori punta
Picco 03:00–06:00, 08:00–12:00 · lun–ven
```

It re-renders every minute, so "am I in peak hours" is answered for the minute you are in,
and its tooltip names the next change (`cambia alle 08:00`). The windows come from the same
price table the cost uses, through `GET /session-cost/peak`: the published definition is
UTC, only the table knows it, and the browser is the only side that knows the reader's zone
— so the conversion happens in the browser, hour by hour against the UTC predicate, which
keeps it correct across DST (03:00–06:00 and 08:00–12:00 in summer, 02:00–05:00 and
07:00–11:00 in winter) and in zones where a published window lands on another local day. If
the route answers nothing, the widget renders nothing rather than a schedule it cannot know.

### Why that position needs an insertion

The sidebar publishes **no seat** between the brand row and the New-session button: its
additive seats are the footer actions and the panel glyphs, its brand title is an SVG
wordmark owned by another package's single slot, and the browsing region that follows is a
single slot too. So the widget registers into the supported `sidebar.footer.action` seat —
which is what renders it at all — and then *moves itself* into the requested position by
inserting one plain node between the shipped elements: anchored to the **source-local half
of their CSS-module class names** (`*_newSession`, else `*_logoRow`), verified by tag rather
than by hash, and re-inserted whenever React drops it.

Nothing shipped is replaced, and the fallback is the whole point: when neither anchor is
found — a DSH update renaming those classes, a sidebar that is not mounted — the widget
renders compactly in the supported footer seat instead of vanishing. The collapsed rail
(56px) renders it not at all.

## Scope: this session *and its subagents*

The figure is the cost of **this work**, which is what the question "what did this cost me"
means: the session being viewed plus every session below it. Delegated work does not run in
the parent's budget — a workflow fan-out of N subagents bills N sessions of its own — and a
parent's log records only that a child exists (`subagent/catalog`, `tool-workflow/agent-start`),
never the child's tokens. So the tree figure is assembled from the children's own logs.

Two sources answer for one session, the live one first:

1. **The projection registry**, for a session still attached to the process — its cells are
   already folded, and its log may trail its in-memory state.
2. **The durable log**, for a session that has gone cold: read, decoded (multi-frame zstd,
   torn tails dropped) and folded *through the same unit the projection uses*, so a
   session's contribution to the tree is exactly its own projection value.

Both are cached against each file's mtime and size, and the route's answer is cached for a
second, so a finished tree costs a directory scan and a few stats. Browsing a *subagent's*
session totals that subagent's own subtree, which is the same rule applied at its root.

The pill's accessible name says "this session's work, its subagents included" whenever the
tree covers more than one session, so a reader who compares it with the provider's account
page knows what they are comparing (that page totals the whole account, which is this tree
only while nothing else has run).

### The routes

`GET /session-cost/tree?session=<id>` answers the tree view as JSON,
`GET /session-cost/peak` answers the published peak definition (UTC windows, weekdays,
whether off-peak is half price, and the table's version and source), and
`GET /session-cost/balance` answers the account balance the provider reports. All three are
same-origin routes on the server the GUI is already served from — the same trust surface as
the page itself, and they expose only these figures. Bad and missing ids answer 400; an
unknown session answers zeros with `complete: false` rather than a guess; a failed read is
refused, never estimated. The tree answer is cached for a second so a burst of reads folds
once; the peak definition is not cached, because the price loader already holds the file's
table; the balance is cached for a minute, because it is money and not a live feed.

### The account balance

The provider's own figure (from `GET /user/balance`), with the granted/topped-up split and
the read time in its tooltip; it re-reads every five minutes. The key never crosses to the
browser: the **host** resolves it exactly as the DeepSeek adapter does — the `credentials`
service first (`DEEPSEEK_API_KEY`, the reference the web Models page writes), then the
launching environment — and calls the provider itself, with `DEEPSEEK_BASE_URL` honored for
the endpoint. Amounts stay the exact decimal strings the provider sent: the display never
rounds, never clips, and never invents a zero. When there is no figure it shows an em dash
and names the cause (no key, refused key, unreachable, timeout, unexpected answer, HTTP
status), and the collapsed rail shows nothing rather than a money figure that does not fit.

It rides **inside the Settings row** (`*_triggerRow`) — the flex row the settings seat
renders around its own trigger button and the connection indicator. It is inserted directly
after the trigger button, which is `flex: 1`, so the figure lands at the row's right edge
without anything being reparented and without joining the button's hit area. The composition
publishes no seat for that position either, so the same rule applies as for the peak widget:
when the anchor is missing the figure renders in the supported `sidebar.footer.action` seat
instead of disappearing.


The client reads it on mount, whenever the session bills another request, whenever the panel
opens, and on a 30-second backstop. **Every failure is silent and degrades to the
per-session projection**: a server that predates the route, a refused fetch, or a malformed
body leaves the pill showing this session's own figure instead of nothing. That is also why
the pack works before its first restart, and why the panel needs no branching.

## Files

| File | Role |
|---|---|
| `lib/index.js` | Host half: the `sessionCost` projection unit, its schemas, and both routes |
| `lib/pricing.js` | Pure arithmetic: table normalization, tier resolution, view building |
| `lib/tree.js` | The session-tree reader: log decoding, header probes, subtree totals, caches |
| `lib/client.js` | Browser half: the cost pill, its panel, the peak widget, the balance, their copy |
| `prices.json` | Published rates, tiers, aliases, and their provenance |
| `cordis.patch.yml` | The bundle patch mounting the single row |
