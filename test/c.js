const path = require('path')
const fs = require('fs')
const test = require('brittle')
const CHyperschema = require('..')
const { runC, generateMainC, primaryType } = require('./helpers/c')

const fixturesDir = path.join(path.dirname(require.resolve('hyperschema-test/package')), 'fixtures')

// Fixtures that generate correct C but cannot yet pass the canonical byte check,
// for reasons outside this generator. Skipped loudly rather than silently so the
// suite never reads as "everything passes" when it does not. Currently empty.
const BLOCKED = {}

// Fixtures whose schema uses a type this generator does not emit yet, declared
// with a reason. A fixture in neither map that still fails to produce a test is
// unaccounted for, and the accounting test below fails on it.
const UNSUPPORTED = {}

const unaccounted = []

function declaredOrUnaccounted(fix, reason) {
  const declared = UNSUPPORTED[fix]
  if (declared === undefined || declared === null) unaccounted.push(`${fix} (${reason})`)
  else test(`fixture ${fix} - unsupported: ${declared}`, { skip: true }, () => {})
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
    declaredOrUnaccounted(fix, 'unsupported type')
    continue
  }

  if (!primaryType(schema)) {
    declaredOrUnaccounted(fix, 'no primary type')
    continue
  }

  test(`fixture ${fix} - compile and round-trip`, (t) => {
    const result = runC(schema, generateMainC(schema, fixtureDir))
    t.ok(result.ok, result.ok ? 'compile and run' : `compile/run failed:\n${result.stderr}`)
  })
}

// The corpus decides what has to be covered, not this suite: a fixture that is
// neither exercised nor declared would otherwise leave the suite green while
// covering less than hyperschema-test ships.
test('every fixture is accounted for', (t) => {
  t.ok(fixtures.length > 0, 'hyperschema-test ships fixtures')
  t.alike(unaccounted, [], 'no fixture is silently skipped')
})
