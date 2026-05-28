const fs = require('fs')
const path = require('path')
const Hyperschema = require('hyperschema')
const generateC = require('./lib/codegen')
const { generateCMake, targetName } = generateC

class CHyperschema extends Hyperschema {
  toCode() {
    this.linkAll()
    return generateC(this)
  }

  static toDisk(hyperschema, dir) {
    if (typeof dir === 'object' && dir) dir = null
    if (!dir) dir = hyperschema.dir

    const root = path.resolve(dir)
    fs.mkdirSync(root, { recursive: true })

    const { header, source } = hyperschema.toCode()
    const target = targetName(hyperschema)
    const schemaJson = JSON.stringify(hyperschema.toJSON(), null, 2) + '\n'
    const cmake = generateCMake(hyperschema)

    fs.writeFileSync(path.join(root, 'schema.json'), schemaJson, { encoding: 'utf-8' })
    fs.writeFileSync(path.join(root, `${target}.h`), header, { encoding: 'utf-8' })
    fs.writeFileSync(path.join(root, `${target}.c`), source, { encoding: 'utf-8' })
    fs.writeFileSync(path.join(root, 'CMakeLists.txt'), cmake, { encoding: 'utf-8' })
  }
}

module.exports = CHyperschema
