const { spawnSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const { toCName, structName } = require('../../lib/codegen')

const WORKSPACE = path.join(__dirname, '../c-workspace')
const BARE_MAKE = path.join(WORKSPACE, 'node_modules', '.bin', 'bare-make')
const TIMEOUT = 120000

function runC(hyperschema, mainC, code) {
  fs.writeFileSync(
    path.join(WORKSPACE, 'schema.json'),
    JSON.stringify(hyperschema.toJSON(), null, 2) + '\n',
    { encoding: 'utf-8' }
  )
  fs.writeFileSync(path.join(WORKSPACE, 'schema.h'), code.header, { encoding: 'utf-8' })
  fs.writeFileSync(path.join(WORKSPACE, 'schema.c'), code.source, { encoding: 'utf-8' })
  fs.writeFileSync(path.join(WORKSPACE, 'main.c'), mainC)

  const shell = process.platform === 'win32'

  const generate = spawnSync(BARE_MAKE, ['generate'], {
    cwd: WORKSPACE,
    encoding: 'utf8',
    timeout: TIMEOUT,
    shell
  })

  if (generate.error || generate.status !== 0) {
    return {
      ok: false,
      stderr: generate.error ? generate.error.message : generate.stderr + generate.stdout
    }
  }

  const build = spawnSync(BARE_MAKE, ['build'], {
    cwd: WORKSPACE,
    encoding: 'utf8',
    timeout: TIMEOUT,
    shell
  })

  if (build.error || build.status !== 0) {
    return { ok: false, stderr: build.error ? build.error.message : build.stderr + build.stdout }
  }

  const exe = path.join(
    WORKSPACE,
    'build',
    process.platform === 'win32' ? 'schema_test.exe' : 'schema_test'
  )

  const run = spawnSync(exe, [], { encoding: 'utf8', timeout: 10000 })

  if (run.error) {
    return { ok: false, stderr: run.error.message }
  }

  return {
    ok: run.status === 0,
    stdout: run.stdout || '',
    stderr: run.stderr || ''
  }
}

function primaryType(schema) {
  return [...schema.types.values()].find((t) => t.isStruct && t.fields.length > 0)
}

function generateRoundTrip(name, type, testValue) {
  const lines = []
  lines.push(`  {`)
  lines.push(`    ${name}_t orig;`)
  lines.push(`    memset(&orig, 0, sizeof(orig));`)
  for (const f of type.fields) {
    const cField = toCName(f.name)
    const val = testValue[f.name]
    if (!f.required) {
      if (val != null) {
        lines.push(`    orig.has_${cField} = true;`)
        lines.push(`    orig.${cField} = ${val}ULL;`)
      } else {
        lines.push(`    orig.has_${cField} = false;`)
      }
    } else {
      lines.push(`    orig.${cField} = ${val}ULL;`)
    }
  }
  lines.push(`    compact_state_t st = {0, 0};`)
  lines.push(`    err = ${name}_preencode(&st, &orig); assert(err == 0);`)
  lines.push(`    st.buffer = malloc(st.end);`)
  lines.push(`    err = ${name}_encode(&st, &orig); assert(err == 0);`)
  lines.push(`    st.start = 0;`)
  lines.push(`    ${name}_t dec;`)
  lines.push(`    memset(&dec, 0, sizeof(dec));`)
  lines.push(`    err = ${name}_decode(&st, &dec); assert(err == 0);`)
  for (const f of type.fields) {
    const cField = toCName(f.name)
    const val = testValue[f.name]
    if (!f.required) {
      if (val != null) {
        lines.push(`    assert(dec.has_${cField} == true);`)
        lines.push(`    assert(dec.${cField} == ${val}ULL);`)
      } else {
        lines.push(`    assert(dec.has_${cField} == false);`)
      }
    } else {
      lines.push(`    assert(dec.${cField} == ${val}ULL);`)
    }
  }
  lines.push(`    free(st.buffer);`)
  lines.push(`  }`)
  return lines
}

function generateMainC(schema, fixtureDir) {
  const testData = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'test.json'), 'utf8'))

  const type = primaryType(schema)
  const name = structName(type)

  const lines = [
    '#include <assert.h>',
    '#include <stdlib.h>',
    '#include <string.h>',
    '#include "schema.h"',
    '',
    'int main () {',
    '  int err;',
    ''
  ]

  for (const testValue of testData.values) {
    lines.push(...generateRoundTrip(name, type, testValue))
    lines.push('')
  }

  lines.push('  return 0;')
  lines.push('}')
  lines.push('')
  return lines.join('\n')
}

module.exports = { runC, generateMainC, primaryType }
