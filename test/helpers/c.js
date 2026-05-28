const { spawnSync } = require('child_process')
const os = require('os')
const path = require('path')
const fs = require('fs')
const {
  toCName,
  structName,
  typeInfo,
  resolveBase,
  fixedSize,
  targetName
} = require('../../lib/codegen')
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
  const target = namespaces.join('_') + '_schema'
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

function floatLit(v, suffix) {
  if (!isFinite(v)) throw new Error(`cannot generate C float literal for non-finite value: ${v}`)
  const s = String(v)
  const hasDecimal = s.includes('.') || s.includes('e') || s.includes('E')
  return hasDecimal ? s + suffix : s + '.0' + suffix
}

function makeLit(info) {
  return (v) =>
    info.cType === 'bool'
      ? v
        ? 'true'
        : 'false'
      : info.cType === 'float'
        ? floatLit(v, 'f')
        : info.cType === 'double'
          ? floatLit(v, '')
          : info.signed
            ? `${v}LL`
            : `${v}ULL`
}

function strView(s) {
  const escaped = s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/\0/g, '\\0')
  const len = Buffer.byteLength(s, 'utf8')
  return `(utf8_string_view_t){ (const utf8_t *)"${escaped}", ${len} }`
}

function toStr(v) {
  return typeof v === 'string' ? v : JSON.stringify(v)
}

function primaryType(schema) {
  const structs = [...schema.types.values()].filter((t) => t.isStruct && t.fields.length > 0)
  return structs[structs.length - 1]
}

function setField(lines, prefix, f, val) {
  const cField = toCName(f.name)
  const base = resolveBase(f.type)
  const fullPath = `${prefix}${cField}`

  if (f.array) {
    const isNull = val === null || val === undefined
    const arrVal = !isNull && Array.isArray(val) ? val : []
    if (!f.required) {
      if (isNull) {
        lines.push(`    orig.${prefix}has_${cField} = false;`)
        return
      }
      lines.push(`    orig.${prefix}has_${cField} = true;`)
    } else {
      if (isNull) {
        throw new Error(
          `fixture has null value for required array field '${f.name}' at '${prefix}'`
        )
      }
    }
    if (base.isStruct || arrVal.length === 0) {
      lines.push(`    orig.${fullPath} = NULL; orig.${fullPath}_len = 0;`)
      return
    }
    const info = typeInfo(base.name)
    const { isBuffer, isString, cType } = info
    const lit = makeLit(info)
    const varName = `_arr_${cField}`
    if (isString) {
      const elems = arrVal.map((v) => strView(toStr(v))).join(', ')
      lines.push(`    { static utf8_string_view_t ${varName}[] = {${elems}};`)
      lines.push(`      orig.${fullPath} = ${varName}; orig.${fullPath}_len = ${arrVal.length}; }`)
    } else if (!isBuffer && fixedSize(base.name) === 0) {
      const elems = arrVal.map((v) => lit(v)).join(', ')
      lines.push(`    { static ${cType} ${varName}[] = {${elems}};`)
      lines.push(`      orig.${fullPath} = ${varName}; orig.${fullPath}_len = ${arrVal.length}; }`)
    } else {
      lines.push(`    orig.${fullPath} = NULL; orig.${fullPath}_len = 0;`)
    }
    return
  }

  if (base.isStruct) {
    if (!f.required) {
      if (val !== null && val !== undefined) {
        lines.push(`    orig.${prefix}has_${cField} = true;`)
        for (const sf of base.fields) setField(lines, `${fullPath}.`, sf, val[sf.name])
      } else {
        lines.push(`    orig.${prefix}has_${cField} = false;`)
      }
    } else {
      if (val === null || val === undefined) {
        throw new Error(
          `fixture has null value for required struct field '${f.name}' at '${prefix}'`
        )
      }
      for (const sf of base.fields) setField(lines, `${fullPath}.`, sf, val[sf.name])
    }
    return
  }

  const info = typeInfo(base.name)
  const isFixed = fixedSize(base.name) > 0
  const { isBuffer, isString } = info
  const lit = makeLit(info)

  if (!f.required) {
    if (val !== null && val !== undefined) {
      lines.push(`    orig.${prefix}has_${cField} = true;`)
      if (isFixed) {
        const bytes = Buffer.isBuffer(val) ? val : Buffer.from(val)
        lines.push(
          `    { static const uint8_t _b[] = {${[...bytes]}}; memcpy(orig.${fullPath}, _b, sizeof(_b)); }`
        )
      } else if (isBuffer) {
        const bytes = Buffer.isBuffer(val) ? val : Buffer.from(val)
        if (bytes.length === 0) {
          lines.push(`    orig.${fullPath} = (uint8_t *)""; orig.${fullPath}_len = 0;`)
        } else {
          lines.push(
            `    { static const uint8_t _b[] = {${[...bytes]}}; orig.${fullPath} = (uint8_t *)_b; orig.${fullPath}_len = sizeof(_b); }`
          )
        }
      } else if (isString) {
        lines.push(`    orig.${fullPath} = ${strView(toStr(val))};`)
      } else {
        lines.push(`    orig.${fullPath} = ${lit(val)};`)
      }
    } else {
      lines.push(`    orig.${prefix}has_${cField} = false;`)
    }
  } else {
    if (val === null || val === undefined) {
      throw new Error(`fixture has null value for required field '${f.name}' at '${prefix}'`)
    }
    if (isFixed) {
      const bytes = Buffer.isBuffer(val) ? val : Buffer.from(val)
      lines.push(
        `    { static const uint8_t _b[] = {${[...bytes]}}; memcpy(orig.${fullPath}, _b, sizeof(_b)); }`
      )
    } else if (isBuffer) {
      const bytes = Buffer.isBuffer(val) ? val : Buffer.from(val)
      if (bytes.length === 0) {
        lines.push(`    orig.${fullPath} = (uint8_t *)""; orig.${fullPath}_len = 0;`)
      } else {
        lines.push(
          `    { static const uint8_t _b[] = {${[...bytes]}}; orig.${fullPath} = (uint8_t *)_b; orig.${fullPath}_len = sizeof(_b); }`
        )
      }
    } else if (isString) {
      lines.push(`    orig.${fullPath} = ${strView(toStr(val))};`)
    } else {
      lines.push(`    orig.${fullPath} = ${lit(val)};`)
    }
  }
}

function compareField(lines, prefix, f, val) {
  const cField = toCName(f.name)
  const base = resolveBase(f.type)
  const fullPath = `${prefix}${cField}`

  if (f.array) {
    const isNull = val === null || val === undefined
    const arrVal = !isNull && Array.isArray(val) ? val : []
    if (!f.required) {
      lines.push(`    assert(dec.${prefix}has_${cField} == ${isNull ? 'false' : 'true'});`)
      if (isNull) return
    }
    if (base.isStruct) {
      lines.push(`    assert(dec.${fullPath}_len == 0);`)
      return
    }
    const info = typeInfo(base.name)
    const { isBuffer, isString } = info
    const lit = makeLit(info)
    lines.push(`    assert(dec.${fullPath}_len == ${arrVal.length});`)
    for (let i = 0; i < arrVal.length; i++) {
      const v = arrVal[i]
      if (isString) {
        lines.push(`    assert(dec.${fullPath}[${i}].len == orig.${fullPath}[${i}].len);`)
        if (Buffer.byteLength(toStr(v), 'utf8') > 0) {
          lines.push(
            `    assert(memcmp(dec.${fullPath}[${i}].data, orig.${fullPath}[${i}].data, orig.${fullPath}[${i}].len) == 0);`
          )
        }
      } else if (!isBuffer && fixedSize(base.name) === 0) {
        lines.push(`    assert(dec.${fullPath}[${i}] == orig.${fullPath}[${i}]);`)
      }
    }
    return
  }

  if (base.isStruct) {
    if (!f.required) {
      if (val !== null && val !== undefined) {
        lines.push(`    assert(dec.${prefix}has_${cField} == true);`)
        for (const sf of base.fields) compareField(lines, `${fullPath}.`, sf, val[sf.name])
      } else {
        lines.push(`    assert(dec.${prefix}has_${cField} == false);`)
      }
    } else {
      for (const sf of base.fields) compareField(lines, `${fullPath}.`, sf, val[sf.name])
    }
    return
  }

  const info = typeInfo(base.name)
  const isFixed = fixedSize(base.name) > 0
  const { isBuffer, isString } = info
  const lit = makeLit(info)

  if (!f.required) {
    if (val !== null && val !== undefined) {
      lines.push(`    assert(dec.${prefix}has_${cField} == true);`)
      if (isFixed) {
        lines.push(
          `    assert(memcmp(dec.${fullPath}, orig.${fullPath}, sizeof(dec.${fullPath})) == 0);`
        )
      } else if (isBuffer) {
        const bytes = Buffer.isBuffer(val) ? val : Buffer.from(val)
        lines.push(`    assert(dec.${fullPath}_len == orig.${fullPath}_len);`)
        if (bytes.length > 0) {
          lines.push(
            `    assert(memcmp(dec.${fullPath}, orig.${fullPath}, orig.${fullPath}_len) == 0);`
          )
        }
      } else if (isString) {
        const len = Buffer.byteLength(String(val), 'utf8')
        lines.push(`    assert(dec.${fullPath}.len == orig.${fullPath}.len);`)
        if (len > 0) {
          lines.push(
            `    assert(memcmp(dec.${fullPath}.data, orig.${fullPath}.data, orig.${fullPath}.len) == 0);`
          )
        }
      } else {
        lines.push(`    assert(dec.${fullPath} == ${lit(val)});`)
      }
    } else {
      lines.push(`    assert(dec.${prefix}has_${cField} == false);`)
    }
  } else {
    if (isFixed) {
      lines.push(
        `    assert(memcmp(dec.${fullPath}, orig.${fullPath}, sizeof(dec.${fullPath})) == 0);`
      )
    } else if (isBuffer) {
      const bytes = Buffer.isBuffer(val) ? val : Buffer.from(val)
      lines.push(`    assert(dec.${fullPath}_len == orig.${fullPath}_len);`)
      if (bytes.length > 0) {
        lines.push(
          `    assert(memcmp(dec.${fullPath}, orig.${fullPath}, orig.${fullPath}_len) == 0);`
        )
      }
    } else if (isString) {
      const len = Buffer.byteLength(String(val), 'utf8')
      lines.push(`    assert(dec.${fullPath}.len == orig.${fullPath}.len);`)
      if (len > 0) {
        lines.push(
          `    assert(memcmp(dec.${fullPath}.data, orig.${fullPath}.data, orig.${fullPath}.len) == 0);`
        )
      }
    } else {
      lines.push(`    assert(dec.${fullPath} == ${lit(val)});`)
    }
  }
}

function generateRoundTrip(name, type, testValue) {
  const lines = []
  lines.push(`  {`)
  lines.push(`    ${name}_t orig;`)
  lines.push(`    memset(&orig, 0, sizeof(orig));`)
  for (const f of type.fields) setField(lines, '', f, testValue[f.name])
  lines.push(`    compact_state_t st = {0, 0};`)
  lines.push(`    err = ${name}_preencode(&st, &orig); assert(err == 0);`)
  lines.push(`    st.buffer = malloc(st.end);`)
  lines.push(`    err = ${name}_encode(&st, &orig); assert(err == 0);`)
  lines.push(`    st.start = 0;`)
  lines.push(`    ${name}_t dec;`)
  lines.push(`    memset(&dec, 0, sizeof(dec));`)
  lines.push(`    err = ${name}_decode(&st, &dec); assert(err == 0);`)
  for (const f of type.fields) compareField(lines, '', f, testValue[f.name])
  lines.push(`    free(st.buffer);`)
  lines.push(`    ${name}_destroy(&dec);`)
  lines.push(`  }`)
  return lines
}

function generateMainC(schema, fixtureDir) {
  const testData = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'test.json'), 'utf8'))

  const type = primaryType(schema)
  const name = structName(type)
  const target = targetName(schema)

  const lines = [
    '#include <assert.h>',
    '#include <stdlib.h>',
    '#include <string.h>',
    `#include "${target}.h"`,
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
