# dsh-addons

Personal additions for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web surface,
packaged as **profile bundles** so they survive a DSH update and install on any machine with two commands.
With them the surface calls itself **DavCode AGENT**: Italian, with cost surfaces and its own brand.

Built and verified on DSH `0.1.6-alpha.1`, Windows, Node 24, pnpm 10.

## What is in here

| Path | What it is |
|---|---|
| `packages/dsh-locale-it` | **Italian language pack**: 1 331 strings across all 44 shipped client locale namespaces, registered as the `it` language |
| `packages/dsh-session-cost` | **Cost surfaces**: the session-tree cost pill beside the composer statistics, a peak/off-peak hour widget above *New session*, and the account balance inside the Settings row |
| `packages/dsh-brand-davcode` | **The identity**: the DavCode AGENT lockup in the sidebar brand row, the mark in the collapsed rail, the artwork alone on the blank-session screen, the product name in the window title, and a tab icon — each in the light and the dark variant of the drawing |
| `tools/locale` | The pipeline that builds the language pack: dictionary extraction, batching, validation, review data, and the incremental update tools |
| `tools/cost` | The verification suites for the cost pack, and the reconciliation against the provider's usage page |
| `tools/brand` | The brand pack's suite, its screen captures in a running UI, and the generator for the Windows launcher icon |
| `tools/verify` | `verify-install.mjs`: integrity of an npx-cached DSH installation (half-extracted packages, unresolved dependencies, declared files cross-checked against the published tarballs) |
| `install` | The installers, the pinned launcher for both platforms, and the script that creates the Desktop shortcut with the brand's icon |
| `docs` | The brand's provenance (the two proposal pages and reference captures) and `Prompt-Installazione-DSH.md`, the task handed to another agent to reproduce all of this on a fresh machine |

Each package has its own README with the design decisions, the exact hooks it uses, and what it
deliberately does not do.

## Install on another machine

Requirements: a working `dsh` installation and `pnpm` on `PATH`.

```powershell
git clone https://github.com/0xDevDav/dsh-addons.git
cd dsh-addons
pwsh -File install/install.ps1          # or: sh install/install.sh
```

The installer runs `dsh plugin --profile web add <pack>` for each package — the same documented path a
hand-installed plugin takes, which installs it into `$DSH_HOME/profiles/web` and appends it to the
profile's `dsh.profile.bundles` — then seeds `locale.preference: it` in `$DSH_HOME/settings.yaml`
when that document has no `locale` section yet, and finally leaves the **DavCode AGENT launcher** and a
Desktop shortcut in place (skip that last part with `-NoShortcut`, or run it alone with
`pwsh -File install/shortcut.ps1`).

Finally **restart the Web surface** (stop and relaunch from the shortcut) and reload the page. A page
reload alone is not enough: the browser bundles are read and hashed when the process boots.

Doing it by hand is the same three commands:

```sh
dsh plugin --profile web add /path/to/dsh-addons/packages/dsh-locale-it
dsh plugin --profile web add /path/to/dsh-addons/packages/dsh-session-cost
dsh plugin --profile web add /path/to/dsh-addons/packages/dsh-brand-davcode
```

## The Desktop shortcut, and the pinned version

`install/launcher/Avvia DavCode AGENT.cmd` (Windows) and `install/launcher/davcode-agent.sh` (elsewhere)
carry the version of DSH they start, and it is **pinned on purpose**: the language pack covers one
release's strings and the brand pack hooks one release's seats and classes, so a silent jump to another
release would leave new strings in English and could move the seats the brand draws in. `install/shortcut.ps1`
copies the launcher and `davcode.ico` into `%LOCALAPPDATA%\dsh`, writes the `.lnk` on the Desktop, and
nudges the shell's icon cache so the new mark shows at once; `install/shortcut.sh` does the freedesktop
equivalent. Re-running either is how the icon is refreshed, and `-Version <version>` is how the pin moves
— after which the suites below are worth running again.

`davcode.ico` is generated from the mark, not drawn by hand: `node tools/brand/make-icon.mjs` writes it
(256/128/64/48/32/16, rendered by Chromium from the same drawing the pack ships).

## What you get after the restart

- **The whole interface in Italian** (Settings → General → Language switches back; the choice persists).
- **A cost pill** beside the composer statistics (`1 turni 107 passi` … `$0,79`), whose panel shows the
  total and the three billed buckets it is made of.
- **A peak-hour widget** above *New session* saying whether the minute you are in is billed at the peak
  rate, with the schedule in your own timezone.
- **Your DeepSeek balance** on the Settings row, read from the provider.
- **The DavCode AGENT brand** instead of the shipped fish: the lockup in the sidebar row (drawn at the
  height the row really has — its name renders at 18.3px, the shipped row's own name is 18px), the mark in
  the collapsed rail, the artwork alone on the blank-session screen at 231×56 (no greeting, no preview
  badge, in any language), `DavCode AGENT` in the window title, and a tab icon — swapping to the light or
  the dark variant with the theme. It is a *brand replacement*, not a fork: nothing shipped is edited, and
  removing the bundle puts the fish and its greeting back.

## Updating the language pack after a DSH release

A release that adds locale keys leaves those keys in English (the pack registers only what it knows,
and the locale runtime falls back to `en` per key). Picking them up is an incremental job: the batches
are regenerated from the new dictionaries, so the existing translations are re-attached by **namespace
and key**, which is what they are actually about.

```sh
node tools/locale/extract2.mjs                                 # shipped dictionaries -> dicts.json
node tools/locale/coverage-diff.mjs dicts-<old>.json dicts.json it-dictionaries.json
#                                                              which strings a pack would leave in English
node tools/locale/plan-update.mjs dicts-<old>.json dicts.json \
     updates/<version>-plan.json                               # what the release adds and rewrites
#   write the Italian for the new keys, and review the reworded ones, into updates/<version>.json
node tools/locale/split.mjs                                    # dicts.json -> batches/batch-NN.json
node tools/locale/apply-update.mjs updates/<version>.json      # carry + apply -> it/batch-NN.json
node tools/locale/validate.mjs                                 # placeholders, coverage, leftovers
node tools/locale/fix-and-group.mjs                            # targeted fixes + review groups
node tools/locale/finalize.mjs                                 # validate, emit it-dictionaries.json
node tools/locale/build-pack.mjs                               # write packages/dsh-locale-it
node tools/locale/test-pack.mjs                                # prove the bundle registers everything
node tools/locale/verify-locale-update.mjs                     # read the strings back out of the installed pack
```

`apply-update.mjs` fails the run when a key in a batch has neither a carried translation nor an entry
in the update file, and also when an entry in the update file matches no key anywhere: that second case
is how a key split wrongly across namespace and key — `settings` + `connection.restart`, not
`settings.connection` + `restart` — would otherwise ship in English without anyone noticing. Keys the
release dropped simply leave the batches.

`tools/locale/GLOSSARIO.md` is the terminology contract the translation was produced under,
`it-dictionaries.json` is the finished source of truth behind the shipped bundle, and `updates/` keeps,
per release, exactly what was translated for it.

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

## Verifying the brand pack

```sh
node tools/brand/test-brand.mjs                     # the drawing, both palettes, the seats, the effects
node tools/brand/inspect-brand.cjs <url> both       # row, rail and hero in a running UI, both schemes
node tools/brand/shoot-rail.cjs <url> dark          # the collapsed sidebar, whole
node tools/brand/shoot-hero.cjs <url> light         # the blank-session screen, whole
node tools/brand/make-icon.mjs [out.ico]            # the Windows launcher icon, from the same mark
```

`test-brand.mjs` runs against `packages/dsh-brand-davcode` and, when the pack is installed, also checks
that the installed bundle is that same file (hash-compared) — so "the repository and the machine agree"
is a test result rather than an assumption. The three browser tools need a resolvable `playwright`
(and a running `dsh web`: the `<url>` is the page's own token URL) and write their captures to `lab/`.

## Verifying an installation

```sh
node tools/verify/verify-install.mjs            # the npx-cached DSH tree, newest one found
node tools/verify/verify-install.mjs --offline  # the same, without the tarball cross-check
node tools/verify/verify-install.selftest.mjs   # proves the checker fails on a damaged tree
```

Counting packages and asking the CLI for `--version` proves nothing: `--version` loads no plugin, and a
package can be present with its files truncated — which is exactly what a killed `npm install` leaves
behind. The checker reports three things instead: every `node_modules` directory carrying a
`package.json`, every declared dependency resolving from where it is declared, and every runtime file
the package declares existing — with the published tarball deciding, when one does not, whether that is
damage or upstream packaging. A leftover lock file is read as "an install was interrupted", which is a
reason to reinstall, not to investigate further.

## Reproducing all of this on another machine

`docs/Prompt-Installazione-DSH.md` is the whole task written out for another agent (it is the prompt this
repository was installed from): which release, which packages, that the shortcut must be **DavCode AGENT**
with **this** icon, that the Desktop must stay clean, and that the API key is asked for and never written
anywhere. `docs/brand/` keeps the brand's provenance: the two proposal pages the mark was chosen from, and
the reference captures (row, rail, blank session, icon) taken in the running UI.

## Things worth knowing before you rely on this

- **The brand artwork is data, not a redraw.** Every coordinate, weight, anchor and colour of the
  supplied drawings is transcribed into `packages/dsh-brand-davcode/lib/client.js`, and
  `tools/brand/test-brand.mjs` asserts all of them in both palettes. The row opens the 24px box the
  shipped CSS gives the brand and draws the canvas at the height the row really has (44px, or less in a
  narrow sidebar, never below 24) — a scale, never a crop or a re-centring. The pack README spells out
  the arithmetic.
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

## License

MIT — see [`LICENSE`](LICENSE), the same license the packages declare in their `package.json`.
Nothing here is affiliated with or endorsed by DeepSeek; every package is a local addition that touches
no shipped file.
