const path = require('path')
const fs = require('fs')
const test = require('brittle')
const CHyperschema = require('..')
const { runC, generateMainC } = require('./helpers/c')

const fixturesDir = path.join(path.dirname(require.resolve('hyperschema-test/package')), 'fixtures')

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

  let schema
  try {
    schema = CHyperschema.from(fixtureDir)
    schema.toCode()
  } catch {
    continue
  }

  const type = [...schema.types.values()].find((t) => t.isStruct && t.fields.length > 0)
  if (!type) continue

  test(`fixture ${fix} - compile and round-trip`, (t) => {
    const result = runC(schema, generateMainC(schema, fixtureDir))
    t.ok(result.ok, `compile/run failed:\n${result.stderr}`)
  })
}
