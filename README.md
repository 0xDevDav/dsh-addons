# dsh-addons

Personal additions for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web surface,
packaged as **profile bundles** so they survive a DSH update and install on any machine with two commands.

Built and verified on DSH `0.1.5-rc.2`, Windows, Node 24, pnpm 10.

## What is in here

| Path | What it is |
|---|---|
| `packages/dsh-locale-it` | **Italian language pack**: 1 257 strings across all 42 shipped client locale namespaces, registered as the `it` language |
| `packages/dsh-session-cost` | **Cost surfaces**: the session-tree cost pill beside the composer statistics, a peak/off-peak hour widget above *New session*, and the account balance inside the Settings row |
| `tools/locale` | The pipeline that builds the language pack: dictionary extraction, batching, validation, review data |
| `tools/cost` | The verification suites for the cost pack, and the reconciliation against the provider's usage page |
| `install` | Installers that add both packs to the local Web profile |

Each package has its own README with the design decisions, the exact hooks it uses, and what it
deliberately does not do.

## Install on another machine

Requirements: a working `dsh` installation and `pnpm` on `PATH`.

```powershell
git clone <this repository>
cd dsh-addons
pwsh -File install/install.ps1          # or: sh install/install.sh
```

The installer runs `dsh plugin --profile web add <pack>` for each package — the same documented path a
hand-installed plugin takes, which installs it into `$DSH_HOME/profiles/web` and appends it to the
profile's `dsh.profile.bundles` — and then seeds `locale.preference: it` in `$DSH_HOME/settings.yaml`
when that document has no `locale` section yet.

Finally **restart the Web surface** (stop and relaunch `dsh web`) and reload the page. A page reload
alone is not enough: the browser bundles are read and hashed when the process boots.

Doing it by hand is the same two commands:

```sh
dsh plugin --profile web add /path/to/dsh-addons/packages/dsh-locale-it
dsh plugin --profile web add /path/to/dsh-addons/packages/dsh-session-cost
```

## What you get after the restart

- **The whole interface in Italian** (Settings → General → Language switches back; the choice persists).
- **A cost pill** beside the composer statistics (`1 turni 107 passi` … `$0,79`), whose panel shows the
  total and the three billed buckets it is made of.
- **A peak-hour widget** above *New session* saying whether the minute you are in is billed at the peak
  rate, with the schedule in your own timezone.
- **Your DeepSeek balance** on the Settings row, read from the provider.

## Regenerating the language pack after a DSH update

A DSH release that adds locale keys leaves those keys in English (the pack registers only what it
knows, and the locale runtime falls back to `en` per key). To pick them up:

```sh
node tools/locale/extract2.mjs      # shipped English dictionaries -> dicts.json
node tools/locale/split.mjs         # dicts.json -> batches/batch-NN.json
#   translate every batch, writing the results into it/batch-NN.json
node tools/locale/validate.mjs      # key coverage, placeholders, leftovers
node tools/locale/fix-and-group.mjs # targeted fixes + review groups
#   review each group, writing fixes into fixes/GN.json
node tools/locale/finalize.mjs      # apply the fixes, validate, emit it-dictionaries.json
node tools/locale/build-pack.mjs    # write packages/dsh-locale-it
node tools/locale/test-pack.mjs     # prove the bundle registers everything
```

`tools/locale/GLOSSARIO.md` is the terminology contract the translation was produced under, and
`it-dictionaries.json` is the finished source of truth behind the shipped bundle.

## Verifying the cost pack

```sh
node tools/cost/test-balance.mjs      # provider response mapping, credential resolution, caching
node tools/cost/test-provenance.mjs   # prices against the official page, in both languages
node tools/cost/test-tree.mjs         # the session-tree reader against an independent scan
node tools/cost/test-projection.mjs   # the fold against a real session log
node tools/cost/test-client.mjs       # the browser half, rendered by a minimal React runtime
node tools/cost/reconcile.mjs         # computed cost vs the provider's own usage figure
```

The tools discover `$DSH_HOME`, the two packs and the session logs by themselves
(`tools/paths.mjs`), and the tests that need a session log take one as an argument and otherwise use
the newest one on disk.

## Things worth knowing before you rely on this

- **Prices are data, not code.** `packages/dsh-session-cost/prices.json` carries the published rates,
  the peak windows (in UTC), the model aliases, and the URL and date they were read from. Editing that
  file reprices every session on its next read, with no restart and no refold. A release that changes
  its prices needs that file updated, nothing else.
- **The cost figure covers a session *and its subagents*.** Delegated work runs in sessions of its own,
  so the tree is assembled from the children's logs; the pill's accessible name says so.
- **Two positions are not composition seats.** The peak widget sits between the brand row and the
  *New session* button, and the balance sits inside the Settings row. Neither position exists as a slot
  in the shipped composition, so both are anchored to the *source-local* half of a CSS-module class name
  and re-inserted if React drops them. If an update renames those classes, both fall back to the
  supported sidebar-footer seat rather than disappearing — see the pack README for the details.
- **No credential ever reaches the browser.** The balance is read host-side through the `credentials`
  service (the same reference the Models page writes), never through a second key store, and never
  crosses to the page.
