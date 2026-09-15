// Self-test of verify-install.mjs: it must stay silent on the packaging quirks that
// are not damage, and it must catch the damage that is.
//
// The healthy fixture reproduces every false alarm the earlier versions raised:
//   - main without an extension                       (ms)
//   - a declared .d.ts that never ships                (@babel/helper-validator-identifier)
//   - a custom export condition pointing at a source   (@standard-schema/spec)
//   - a directory target carrying its own package.json (tslib's "./")
//   - a runtime file absent here that upstream does not ship either
//                                                      (@modelcontextprotocol/sdk)
// The damaged fixture reproduces the real failure that was missed:
//   - a runtime file absent here that the published tarball does ship (zod/v4)
//   - a package directory with no package.json (a killed install)
//   - a dependency that resolves nowhere
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.join(os.tmpdir(), 'dsh-verify-selftest')
fs.rmSync(root, { recursive: true, force: true })

const write = (file, content) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content, null, 2))
}

// ── a healthy tree with every quirk that is not damage ──────────────────────
const good = path.join(root, 'good', 'node_modules')
write(path.join(good, 'ms', 'package.json'), { name: 'ms', version: '1.0.0', main: './index' })
write(path.join(good, 'ms', 'index.js'), 'module.exports = 1')
write(path.join(good, '@babel', 'helper-validator-identifier', 'package.json'), {
  name: '@babel/helper-validator-identifier',
  version: '1.0.0',
  exports: { '.': { types: './lib/index.d.ts', default: './lib/index.js' } },
})
write(path.join(good, '@babel', 'helper-validator-identifier', 'lib', 'index.js'), 'module.exports = 2')
write(path.join(good, '@standard-schema', 'spec', 'package.json'), {
  name: '@standard-schema/spec',
  version: '1.0.0',
  exports: {
    '.': {
      'standard-schema-spec': './src/index.ts',
      import: { types: './dist/index.d.ts', default: './dist/index.js' },
      require: { types: './dist/index.d.cts', default: './dist/index.cjs' },
    },
  },
})
write(path.join(good, '@standard-schema', 'spec', 'dist', 'index.js'), 'export {}')
write(path.join(good, '@standard-schema', 'spec', 'dist', 'index.cjs'), 'module.exports = {}')
write(path.join(good, 'tslib', 'package.json'), { name: 'tslib', version: '2.0.0', exports: { '.': { default: './' } } })
write(path.join(good, 'tslib', 'tslib.js'), 'module.exports = 3')
// declares a runtime file that the published tarball does not ship either
write(path.join(good, '@scope', 'benign', 'package.json'), {
  name: '@scope/benign',
  version: '1.0.0',
  exports: { '.': { import: './dist/esm/index.js', require: './dist/cjs/index.js' } },
})
write(path.join(good, '@scope', 'benign', 'dist', 'cjs', 'index.js'), 'module.exports = 4')
// a package whose dependency is hoisted to the root, as npm installs it
write(path.join(good, 'needy', 'package.json'), { name: 'needy', version: '1.0.0', dependencies: { ms: '^1.0.0' } })
write(path.join(good, 'needy', 'index.js'), '')
write(path.join(good, 'dsh', 'package.json'), {
  name: 'dsh', version: '1.0.0', bin: { dsh: './lib/bin.js' },
  dependencies: { ms: '^1.0.0', needy: '^1.0.0' },
})
write(path.join(good, 'dsh', 'lib', 'bin.js'), '')

// ── a damaged tree: the zod/v4 failure plus a killed install ────────────────
const bad = path.join(root, 'bad', 'node_modules')
write(path.join(bad, 'zod', 'package.json'), {
  name: 'zod',
  version: '4.0.0',
  exports: {
    '.': { import: './index.js', require: './index.cjs' },
    './v4': { import: './v4/index.js' },
    './v4/classic/external.js': { import: './v4/classic/external.js' },
  },
})
write(path.join(bad, 'zod', 'index.js'), '')
write(path.join(bad, 'zod', 'index.cjs'), '')
write(path.join(bad, 'zod', 'v4', 'index.js'), '')
// v4/classic/external.js deliberately absent: what a truncated zod looked like
write(path.join(bad, 'broken', 'leftover.js'), '')  // no package.json at all
write(path.join(bad, 'needy', 'package.json'), { name: 'needy', version: '1.0.0', dependencies: { ghost: '^1.0.0' } })
write(path.join(bad, 'needy', 'index.js'), '')

// ── stub listings of what the registry actually publishes ───────────────────
const stubs = path.join(root, 'published')
write(path.join(stubs, '@scope+benign-1.0.0.files'), 'package/dist/cjs/index.js')
write(path.join(stubs, 'zod-4.0.0.files'), 'package/index.js\npackage/index.cjs\npackage/v4/index.js\npackage/v4/classic/external.js')

const verifier = fileURLToPath(new URL('./verify-install.mjs', import.meta.url))
const run = (modules) => {
  try {
    return { status: 0, out: execFileSync(process.execPath, [verifier, modules], { encoding: 'utf8', env: { ...process.env, DSH_VERIFY_TARBALL_DIR: stubs } }) }
  } catch (error) {
    return { status: error.status, out: `${error.stdout ?? ''}${error.stderr ?? ''}` }
  }
}

const failures = []
const check = (condition, message) => { if (!condition) failures.push(message) }
const summary = (out) => out.split('\n').filter((line) => /half-written|do not resolve|shipped upstream|published package too|not consulted|VERDICT|  \S+ +->/.test(line)).join('\n')

const healthy = run(good)
console.log('=== healthy tree (must report no damage) ===')
console.log(summary(healthy.out))
check(healthy.status === 0, `healthy tree exited ${healthy.status} instead of 0`)
check(healthy.out.includes('half-written packages (no package.json):   0'), 'healthy tree reported a half-written package')
check(healthy.out.includes('dependencies that do not resolve:          0'), 'healthy tree reported an unresolved dependency')
check(healthy.out.includes('shipped upstream (damage): 0'), 'healthy tree reported damage')
check(healthy.out.includes('published package too (upstream packaging, harmless): 1'), 'healthy tree did not classify the upstream-packaging case')

const damaged = run(bad)
console.log('')
console.log('=== damaged tree (must report all three faults) ===')
console.log(summary(damaged.out))
check(damaged.status === 1, `damaged tree exited ${damaged.status} instead of 1`)
check(/zod\s+->\s+\.\/v4\/classic\/external\.js/.test(damaged.out), 'did not catch the truncated zod file')
check(/broken/.test(damaged.out), 'did not catch the half-written package')
check(/needy needs ghost/.test(damaged.out), 'did not catch the unresolvable dependency')
check(damaged.out.includes('shipped upstream (damage): 1'), 'expected exactly one confirmed damage')
check(damaged.out.includes('dependencies that do not resolve:          1'), 'expected exactly one unresolved dependency')

console.log('')
console.log(failures.length === 0 ? 'SELFTEST PASSED: no false alarms, all three faults caught, upstream packaging recognised.' : `SELFTEST FAILED (${failures.length}):`)
for (const failure of failures) console.log('  ! ' + failure)
fs.rmSync(root, { recursive: true, force: true })
process.exit(failures.length === 0 ? 0 : 1)
