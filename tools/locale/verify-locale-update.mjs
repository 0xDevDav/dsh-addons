// Content check of the shipped Italian dictionary after the 0.1.6-alpha.1 update: the bundle
// the profile actually serves is loaded with a stub loader, and the strings this release added
// are read back out of it by namespace and key.
//
//   node tools/locale/verify-locale-update.mjs [path/to/dsh-locale-it/lib/client.js]
//
// With no argument it checks the installed pack, found through `$DSH_HOME`.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { packPath } from '../paths.mjs'

const DICT = process.argv[2] ?? path.join(packPath('dsh-locale-it'), 'lib', 'client.js')
const SOURCE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'it-dictionaries.json')

const dict = JSON.parse(fs.readFileSync(SOURCE, 'utf8'))
let captured
globalThis.window = { __ModuleLoader__: { load(definition) { captured = definition } } }
await import(pathToFileURL(DICT).href)
const registered = captured.factory()

const languages = []
const dictionaries = {}
registered.apply({
  locale: {
    addLanguage(language) { languages.push(language); return () => {} },
    register(ns, id, value) { dictionaries[ns] = value; return () => {} },
  },
  effect(fn) { fn() },
})

const expected = {
  'trajectory.view.trajectory': 'Registro',
  'trajectory.code.running': 'In esecuzione…',
  'trajectory.record.wrapLines': 'Ritorno a capo automatico',
  'trajectory.code.copySource': 'Copia codice',
  'sidebarTerminal.title': 'Terminale',
  'sidebarTerminal.exited': 'Processo terminato ({code})',
  'sidebarTerminal.terminalLimit': 'Hai raggiunto il limite di terminali. Chiudi quelli che non usi e riprova. Anche i terminali terminati contano nel limite.',
  'sidebarTerminal.shell': 'Scegli la shell',
  'settings.archivedSessions.nav': 'Sessioni archiviate',
  'settings.archivedSessions.unarchiveNamed': 'Ripristina {title}',
  'settings.archivedSessions.time.months': '{n}mes',
  'settings.archivedSessions.time.years': '{n}a',
  'settings.connection.restart': 'Riconnessione in corso, riconnetti ora',
  'settings.agentPreset.inUse': 'Predefinito per le nuove attività',
  'settings.agentPreset.showPicker': 'Consenti di cambiare modalità agente',
  'settings.models.deepSeekEndpointHint': 'Usa un endpoint compatibile con la connessione configurata.',
  'permission.access.auto.confirm.enable': 'Attiva Auto review',
  'permission.access.auto.badge': 'EXP',
  'permission.access.mode': 'Modalità di accesso, attuale: {name}',
  'conversation.input.commands': 'Aggiungi file o esegui comandi',
  'conversation.tool.autoReviewNotExecuted': 'Lo strumento non è stato eseguito. Motivo: {reason}',
  'command.label.compact': 'Compatta',
  'command.token.compact': 'compact',
  'model.command.label': 'Modello',
  'question.action.skip': 'Salta',
  'documentHtml.loading': 'Lettura…',
  'sidebarImage.loading': 'Lettura…',
  'sidebarPdf.loading': 'Lettura…',
  'sidebarDocumentPreview.unsupportedFile': "L'anteprima non è ancora disponibile per questo tipo di file.",
  'sidebarDocumentPreview.error.notText': "L'anteprima non è ancora disponibile per questo tipo di file.",
  'chat.duration.hours': '{hours}h {minutes}m {seconds}s',
  // values the pipeline's own fixes own, to prove they still run after the update
  'model.menu.effort': 'Livello di ragionamento',
  'trajectory.kind.system': 'SISTEMA',
  'trajectory.timeline.ttftDecoding': 'TTFT {ttft} · Decodifica {decoding}',
  'common.brand.localBuild': 'Build locale DSH',
  'workspace.groupBy.workspace': 'Area di lavoro',
}

const gone = [
  'conversation.access.confirm.title',
  'conversation.input.accessMode',
  'conversation.file.attach',
  'deliverables.presented.open',
  'settings.connection.retry',
  'common.json.collapseNode',
]

const failures = []
// A key may itself contain dots (`trajectory` + `view.trajectory`), so the split
// cannot be guessed: try every boundary and take the one the dictionary has.
const lookup = (source, flat) => {
  for (let at = flat.indexOf('.'); at !== -1; at = flat.indexOf('.', at + 1)) {
    const ns = flat.slice(0, at)
    const key = flat.slice(at + 1)
    if (source[ns] && Object.prototype.hasOwnProperty.call(source[ns], key)) return source[ns][key]
  }
  return undefined
}
const read = (flat) => lookup(dict, flat)

console.log('--- valori attesi ---')
for (const [flat, value] of Object.entries(expected)) {
  const actual = read(flat)
  const ok = actual === value
  if (!ok) failures.push(`${flat}: atteso ${JSON.stringify(value)}, trovato ${JSON.stringify(actual)}`)
  console.log(`  ${ok ? 'OK ' : '!! '} ${flat} = ${JSON.stringify(actual)}`)
}

console.log('')
console.log('--- il pacchetto registrato porta gli stessi valori? ---')
for (const [flat, value] of Object.entries(expected)) {
  if (lookup(dictionaries, flat) !== value) failures.push(`bundle: ${flat} non corrisponde`)
}
console.log(`  namespace registrati: ${Object.keys(dictionaries).length}`)
console.log(`  chiavi registrate: ${Object.values(dictionaries).reduce((total, entries) => total + Object.keys(entries).length, 0)}`)
console.log(`  lingua registrata: ${JSON.stringify(languages[0])}`)

console.log('')
console.log('--- chiavi rimosse dalla release: non devono essere nel pacchetto ---')
for (const flat of gone) {
  const actual = read(flat)
  const ok = actual === undefined
  if (!ok) failures.push(`${flat} dovrebbe essere assente, vale ${JSON.stringify(actual)}`)
  console.log(`  ${ok ? 'OK ' : '!! '} ${flat} assente`)
}

console.log('')
console.log(failures.length === 0 ? 'VERIFICA SUPERATA' : `VERIFICA FALLITA (${failures.length})`)
for (const failure of failures) console.log('  ! ' + failure)
process.exit(failures.length === 0 ? 0 : 1)
