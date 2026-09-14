// Apply targeted fixes, then emit per-group review files for the consistency pass.
import fs from 'node:fs'

const DIR = import.meta.dirname
const merged = JSON.parse(fs.readFileSync(`${DIR}/it-merged.json`, 'utf8'))

const FIXES = {
  common: { 'brand.localBuild': 'Build locale DSH' },
  chat: { 'chat.deepDiving': 'Analisi approfondita…' },
  model: { 'menu.effort': 'Impegno' },
  workspace: { 'groupBy.workspace': 'Area di lavoro' },
  conversation: { 'terminal.signal': 'segnale {signal}' },
  trajectory: {
    'kind.system': 'SISTEMA',
    'kind.user': 'UTENTE',
    'kind.assistant': 'ASSISTENTE',
    'kind.tool': 'STRUMENTO',
    'kind.context': 'CONTESTO',
    'kind.compacted': 'COMPATTATO',
    'kind.subtool': 'SOTTOSTRUMENTO',
    'kind.sub': 'SUB',
    'timeline.ttftDecoding': 'TTFT {ttft} · Decodifica {decoding}',
  },
}

let applied = 0
for (const [ns, fixes] of Object.entries(FIXES)) {
  for (const [k, v] of Object.entries(fixes)) {
    if (!merged[ns]?.[k]) { console.log(`MISSING ${ns}.${k}`); continue }
    merged[ns][k].it = v
    applied++
  }
}
fs.writeFileSync(`${DIR}/it-merged.json`, JSON.stringify(merged, null, 1))
console.log(`applied ${applied} targeted fixes`)

// Groups for the cross-batch consistency review.
const GROUPS = {
  G1: ['trajectory', 'chat'],
  G2: ['conversation', 'common'],
  G3: ['settings.models', 'settings.plugins', 'settings.pluginInventory'],
  G4: ['workspace', 'settings.agentPreset', 'cordis', 'deliverables'],
  G5: ['subagent', 'sidebarRight', 'feedback', 'model', 'schedule.catalog', 'open-in-app'],
  G6: [
    'sidebarDocumentPreview', 'workflowRun', 'job', 'question', 'command', 'directory-browser',
    'sidebarFiles', 'goal', 'settings.permission', 'settings', 'reference', 'slash.menu',
    'sidebarPdf', 'settings.theme', 'session-log-download', 'permission.access', 'skill', 'plan',
    'approval', 'sidebar', 'sidebarImage', 'documentMarkdown', 'documentHtml',
    'sidebarCodePreview', 'settings.locale',
  ],
}

fs.rmSync(`${DIR}/review`, { recursive: true, force: true })
fs.mkdirSync(`${DIR}/review`, { recursive: true })
fs.mkdirSync(`${DIR}/fixes`, { recursive: true })

const manifest = []
for (const [id, namespaces] of Object.entries(GROUPS)) {
  const payload = {}
  let keys = 0
  for (const ns of namespaces) {
    if (!merged[ns]) { console.log(`group ${id}: UNKNOWN namespace ${ns}`); continue }
    payload[ns] = merged[ns]
    keys += Object.keys(merged[ns]).length
  }
  fs.writeFileSync(`${DIR}/review/${id}.json`, JSON.stringify(payload, null, 1))
  manifest.push({ id, file: `${id}.json`, namespaces: namespaces.length, keys })
}
console.log('\ngroups:')
for (const g of manifest) console.log(`  ${g.id}  namespaces=${g.namespaces}  keys=${g.keys}`)
console.log(`  total keys in groups: ${manifest.reduce((a, g) => a + g.keys, 0)}`)
fs.writeFileSync(`${DIR}/review/groups.json`, JSON.stringify(manifest, null, 1))
