const { spawnSync } = require('child_process')
const os = require('os')
const path = require('path')
const fs = require('fs')
const { toCName, structName, typeInfo, resolveBase } = require('../../lib/codegen')
const CHyperschema = require('../..')

const WORKSPACE = path.join(__dirname, '../c-workspace')
const SCHEMA_DIR = path.join(WORKSPACE, 'schema')
const BARE_MAKE = path.join(__dirname, '../../node_modules/.bin/bare-make')
const CMAKE_FETCH = path.join(__dirname, '../../node_modules/cmake-fetch').replace(/\\/g, '/')
const TIMEOUT = 120000

function generateWorkspaceCMake(hyperschema) {
  const structs = []
  for (let i = 0; i < hyperschema.schema.length; i++) {
    const fqn = hyperschema.typesByPosition.get(i)
    const type = hyperschema.resolve(fqn)
    if (type.isStruct) structs.push(type)
  }
  const namespaces = [...new Set(structs.map((t) => toCName(t.namespace)))]
  if (!namespaces.length) {
    throw new Error('hyperschema-c: schema has no structs — cannot derive CMake target name')
  }
  const target = namespaces.join('_')
  return [
    'cmake_minimum_required(VERSION 4.0)',
    '',
    `find_package(cmake-fetch REQUIRED PATHS "${CMAKE_FETCH}")`,
    '',
    'project(schema_test C)',
    '',
    'fetch_package("github:holepunchto/libcompact")',
    '',
    'add_subdirectory(schema)',
    '',
    'add_executable(schema_test main.c)',
    '',
    'set_target_properties(',
    '  schema_test',
    '  PROPERTIES',
    '  C_STANDARD 99',
    ')',
    '',
    `target_link_libraries(schema_test PRIVATE ${target} compact)`,
    ''
  ].join('\n')
}

function runC(hyperschema, mainC) {
  CHyperschema.toDisk(hyperschema, SCHEMA_DIR)
  fs.writeFileSync(path.join(WORKSPACE, 'main.c'), mainC)
  fs.writeFileSync(path.join(WORKSPACE, 'CMakeLists.txt'), generateWorkspaceCMake(hyperschema))

  const shell = os.platform() === 'win32'

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
    os.platform() === 'win32' ? 'schema_test.exe' : 'schema_test'
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
    const { signed } = typeInfo(resolveBase(f.type).name)
    const lit = (v) => (signed ? `${v}LL` : `${v}ULL`)
    if (!f.required) {
      if (val !== null && val !== undefined) {
        lines.push(`    orig.has_${cField} = true;`)
        lines.push(`    orig.${cField} = ${lit(val)};`)
      } else {
        lines.push(`    orig.has_${cField} = false;`)
      }
    } else {
      if (val === null || val === undefined) {
        throw new Error(`fixture has null value for required field '${f.name}' in type '${name}'`)
      }
      lines.push(`    orig.${cField} = ${lit(val)};`)
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
    const { signed } = typeInfo(resolveBase(f.type).name)
    const lit = (v) => (signed ? `${v}LL` : `${v}ULL`)
    if (!f.required) {
      if (val !== null && val !== undefined) {
        lines.push(`    assert(dec.has_${cField} == true);`)
        lines.push(`    assert(dec.${cField} == ${lit(val)});`)
      } else {
        lines.push(`    assert(dec.has_${cField} == false);`)
      }
    } else {
      lines.push(`    assert(dec.${cField} == ${lit(val)});`)
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
