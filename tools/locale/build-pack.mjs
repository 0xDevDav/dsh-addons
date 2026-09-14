import { packPath, packagesRoot, sessionsRoot, newestSessionLog, rootSessionId } from '../paths.mjs'
// Generate the dsh-locale-it bundle package from the validated dictionaries.
import fs from 'node:fs'
import path from 'node:path'

const DIR = import.meta.dirname
const dict = JSON.parse(fs.readFileSync(`${DIR}/it-dictionaries.json`, 'utf8'))
const PACK = packPath('dsh-locale-it')

const nsCount = Object.keys(dict).length
const keyCount = Object.values(dict).reduce((a, d) => a + Object.keys(d).length, 0)

fs.rmSync(PACK, { recursive: true, force: true })
fs.mkdirSync(path.join(PACK, 'lib'), { recursive: true })

// ── package.json ─────────────────────────────────────────────────────────────
const pkg = {
  name: 'dsh-locale-it',
  version: '1.0.0',
  private: true,
  description: `Italian (it) language pack for the DeepSeek Harness web GUI: ${keyCount} strings across ${nsCount} locale namespaces`,
  type: 'module',
  main: 'lib/index.js',
  exports: {
    '.': { default: './lib/index.js' },
    './client': { default: './lib/client.js' },
    './cordis.patch.yml': './cordis.patch.yml',
    './package.json': './package.json',
  },
  files: ['lib/index.js', 'lib/client.js', 'cordis.patch.yml'],
  dsh: {
    bundle: { patch: './cordis.patch.yml' },
    client: {
      inject: ['@deepseek-ai/dsh-client-locale'],
      platform: 'web',
    },
  },
  license: 'MIT',
}
fs.writeFileSync(path.join(PACK, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')

// ── host half (no-op: every contribution is browser-side) ────────────────────
fs.writeFileSync(
  path.join(PACK, 'lib', 'index.js'),
  `/**
 * Node half of the Italian language pack.
 *
 * The pack contributes only browser-side copy: the language definition and one
 * dictionary per locale namespace, registered against the client \`locale\`
 * service. Nothing is registered on the host plane, so this half is deliberately
 * empty — it exists because a client row is mounted through its package's main
 * entry.
 *
 * @module dsh-locale-it
 */

/** Mount the (empty) host half. */
export function apply() {}
`,
)

// ── browser half: language definition + one dictionary per namespace ─────────
const client = `window.__ModuleLoader__.load({
	id: "dsh-locale-it",
	factory: () => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		/**
		* Italian dictionaries, one namespace per shipped locale namespace. Keys
		* mirror the shipped English key sets exactly; lookup falls back through
		* "en" for any key a future version adds before this pack catches up.
		*/
		const DICTIONARIES = ${JSON.stringify(dict, null, 1).replace(/\n/g, '\n\t\t')};
		/** The external language id, its self-described label, and its fallback. */
		const LANGUAGE = { id: "it", label: "Italiano", fallback: "en" };
		/** The one service this pack needs: the client locale registry. */
		const inject = ["locale"];
		/**
		* Register the language and every dictionary as owned effects, so stopping,
		* updating, or unloading this pack removes exactly what it contributed.
		* A contribution that is already registered (a second mount of this pack,
		* or a hot reload) is left alone rather than failing activation.
		* @param ctx - client cordis context.
		*/
		function apply(ctx) {
			const locale = ctx.locale;
			ctx.effect(() => {
				try {
					return locale.addLanguage(LANGUAGE);
				} catch {
					return () => {};
				}
			}, "locale-it: language");
			for (const [ns, dict] of Object.entries(DICTIONARIES)) {
				ctx.effect(() => {
					try {
						return locale.register(ns, LANGUAGE.id, dict);
					} catch {
						return () => {};
					}
				}, "locale-it: " + ns);
			}
		}
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
`
fs.writeFileSync(path.join(PACK, 'lib', 'client.js'), client)

// ── composition patch: this bundle's own row ────────────────────────────────
fs.writeFileSync(
  path.join(PACK, 'cordis.patch.yml'),
  `# dsh-locale-it bundle patch: mounts the Italian language pack as one client
# row. Applied after the dsh-base and dsh-web-app layers, so the row lands
# after the locale plugin whose service it injects.
- insert:
    - id: locale-it
      name: dsh-locale-it
`,
)

const readme = `# dsh-locale-it

Italian (\`it\`) language pack for the DeepSeek Harness web GUI.

- Registers the \`it\` language with the client \`locale\` service (fallback \`en\`).
- Registers ${keyCount} translated strings across ${nsCount} locale namespaces.
- Adds nothing to the host plane and changes no shipped package.

## Use

The pack is installed as a profile bundle, so its row mounts on every start:

\`\`\`
dsh plugin --profile web add <path to this directory>
\`\`\`

Select **Impostazioni → Generale → Lingua → Italiano**, or set the durable
preference once in \`$DSH_HOME/settings.yaml\`:

\`\`\`yaml
locale:
  preference: it
\`\`\`

## Coverage

Every key of every shipped client locale namespace is translated. Keys added by
a newer DSH release than this pack fall back to English instead of showing a raw
key. Host-plane copy that never enters the client locale registry — provider
model names, tool names, plugin configuration field labels — stays as the host
supplies it.
`
fs.writeFileSync(path.join(PACK, 'README.md'), readme)

console.log(`pack written: ${PACK}`)
for (const f of fs.readdirSync(PACK, { recursive: true })) {
  const p = path.join(PACK, f)
  if (fs.statSync(p).isFile()) console.log(`  ${f}  ${(fs.statSync(p).size / 1024).toFixed(1)} KiB`)
}
console.log(`\nnamespaces: ${nsCount}  keys: ${keyCount}`)
