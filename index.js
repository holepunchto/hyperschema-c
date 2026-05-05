'use strict'

const fs = require('fs')
const path = require('path')
const Hyperschema = require('hyperschema')
const generateC = require('./lib/codegen')

class CHyperschema extends Hyperschema {
  toCode () {
    this.linkAll()
    return generateC(this)
  }

  static toDisk (hyperschema, dir, opts) {
    if (typeof dir === 'object' && dir) {
      opts = dir
      dir = null
    }

    if (!dir) dir = hyperschema.dir

    hyperschema.linkAll()

    const root = path.resolve(dir)
    fs.mkdirSync(root, { recursive: true })

    fs.writeFileSync(
      path.join(root, 'schema.json'),
      JSON.stringify(hyperschema.toJSON(), null, 2) + '\n',
      { encoding: 'utf-8' }
    )
    fs.writeFileSync(path.join(root, 'schema.h'), hyperschema.toCode(opts), {
      encoding: 'utf-8'
    })
  }
}

module.exports = CHyperschema
