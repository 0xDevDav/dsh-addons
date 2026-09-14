// Targeted scan: words that MUST be Italian in the final values.
import fs from 'node:fs'

const merged = JSON.parse(fs.readFileSync((import.meta.dirname + '/it-merged.json'), 'utf8'))

// Terms I decided must be translated (whole word, case-insensitive).
const MUST_TRANSLATE = [
  'session', 'sessions', 'turn', 'turns', 'step', 'steps', 'tool', 'tools', 'agent', 'agents',
  'subagent', 'subagents', 'workspace', 'workspaces', 'setting', 'settings', 'sidebar',
  'approval', 'permission', 'permissions', 'attachment', 'attachments', 'outline',
  'deliverable', 'deliverables', 'transcript', 'message', 'messages', 'notification',
  'notifications', 'loading', 'effort', 'reasoning', 'round', 'rounds', 'language', 'theme',
  'view', 'title', 'empty', 'custom', 'default', 'defaults', 'enable', 'enabled', 'disable',
  'disabled', 'restart', 'reload', 'uninstall', 'install', 'installed', 'version', 'feature',
  'support', 'request', 'response', 'warning', 'failed', 'failure', 'available', 'unavailable',
  'required', 'optional', 'configure', 'configuration', 'search', 'copied', 'cancel', 'save',
  'saved', 'delete', 'deleted', 'retry', 'submit', 'previous', 'skip', 'unknown', 'none',
  'collapse', 'expand', 'expanded', 'browser', 'folder', 'folders', 'character', 'characters',
  'property', 'properties', 'node', 'nodes', 'footnote', 'footnotes', 'thousand', 'million',
  'duration', 'seconds', 'minutes', 'hours', 'days', 'milliseconds', 'pending', 'queue',
  'queued', 'steer', 'steering', 'hide', 'show', 'hidden', 'visible', 'remove', 'reset',
  'selected', 'choose', 'chosen', 'create', 'created', 'usage', 'average', 'waiting', 'started',
  'stopped', 'running', 'idle', 'wait', 'done', 'ready', 'busy', 'active', 'inactive', 'parent',
  'child', 'children', 'first', 'last', 'sample', 'example', 'summary', 'detail', 'details',
  'overview', 'preview', 'history', 'timeline', 'trace', 'trajectory', 'approve', 'reject',
  'allow', 'deny', 'label', 'labels', 'value', 'values', 'name', 'names', 'text', 'line', 'lines',
]

// Loanwords/nouns explicitly allowed to survive.
const ALLOWED = new Set([
  'token', 'tokens', 'tok', 'prompt', 'prompts', 'plugin', 'plugins', 'workflow', 'workflows',
  'sandbox', 'checkpoint', 'rollback', 'skill', 'skills', 'preset', 'presets', 'cache', 'commit',
  'diff', 'feedback', 'chat', 'job', 'jobs', 'cron', 'streaming', 'payload', 'schema', 'input',
  'output', 'provider', 'endpoint', 'host', 'client', 'file', 'files', 'id', 'uuid', 'text',
  'type', 'typescript', 'sdk', 'code', 'plan', 'goal', 'context', 'mode', 'level', 'levels',
  'model', 'models', 'server', 'proxy', 'gateway', 'base', 'total', 'name', 'names', 'value',
  'values', 'label', 'labels', 'line', 'lines', 'node', 'nodes', 'first', 'last', 'all', 'any',
  'done', 'active', 'parent', 'child', 'children', 'time', 'date', 'sample', 'example', 'title',
])

const hits = []
for (const [ns, entries] of Object.entries(merged)) {
  for (const [k, v] of Object.entries(entries)) {
    const stripped = v.it.replace(/\{[^}]*\}/g, ' ')
    const words = stripped.match(/[A-Za-z][A-Za-z'’-]*/g) ?? []
    const bad = [...new Set(words.map((w) => w.toLowerCase()).filter((w) => MUST_TRANSLATE.includes(w) && !ALLOWED.has(w)))]
    if (bad.length) hits.push({ ns, k, bad, en: v.en, it: v.it })
  }
}

console.log(`hits: ${hits.length}\n`)
for (const h of hits) {
  console.log(`${h.ns}.${h.k}   [${h.bad.join(', ')}]`)
  console.log(`   en: ${h.en.replace(/\n/g, ' | ').slice(0, 240)}`)
  console.log(`   it: ${h.it.replace(/\n/g, ' | ').slice(0, 240)}`)
}
