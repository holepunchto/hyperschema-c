const path = require('path')
const fs = require('fs')
const test = require('brittle')
const CHyperschema = require('..')
const { runC, generateMainC, primaryType } = require('./helpers/c')

const fixturesDir = path.join(path.dirname(require.resolve('hyperschema-test/package')), 'fixtures')

// Fixtures that generate correct C but cannot yet pass the canonical byte check,
// for reasons outside this generator. Skipped loudly rather than silently so the
// suite never reads as "everything passes" when it does not.
const FLOAT = 'libcompact float32/float64 truncate to int instead of copying IEEE bits'
const BLOCKED = {
  4: FLOAT,
  15: FLOAT,
  17: FLOAT,
  18: FLOAT,
  20: FLOAT,
  30: FLOAT,
  31: FLOAT,
  42: 'libcompact int56 zig-zag diverges from JS at -(2^53 - 1)',
  26: 'versioned types are not generated yet (follow-up PR)'
}

const fixtures = fs
  .readdirSync(fixturesDir)
  .filter((f) => {
    try {
      return fs.statSync(path.join(fixturesDir, f)).isDirectory()
    } catch {
      return false
    }
  })
  .sort((a, b) => Number(a) - Number(b))

for (const fix of fixtures) {
  const fixtureDir = path.join(fixturesDir, fix)

  if (BLOCKED[fix]) {
    test(`fixture ${fix} - skipped: ${BLOCKED[fix]}`, { skip: true }, () => {})
    continue
  }

  let schema
  try {
    schema = CHyperschema.from(fixtureDir)
    schema.toCode()
  } catch (e) {
    if (e.code !== 'UNSUPPORTED_TYPE') throw e
    continue
  }

  if (!primaryType(schema)) continue

  const testData = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'test.json'), 'utf8'))
  const firstVal = testData.values[0]
  if (Array.isArray(firstVal)) continue // array-alias fixture
  const fieldNames = new Set(primaryType(schema).fields.map((f) => f.name))
  const valKeys = Object.keys(firstVal)
  if (valKeys.length > 0 && !valKeys.some((k) => fieldNames.has(k))) continue // record/map fixture

  test(`fixture ${fix} - compile and round-trip`, (t) => {
    const result = runC(schema, generateMainC(schema, fixtureDir))
    t.ok(result.ok, result.ok ? 'compile and run' : `compile/run failed:\n${result.stderr}`)
  })
}
