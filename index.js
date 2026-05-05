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

  static toDisk (hyperschema, dir) {
    if (typeof dir === 'object' && dir) dir = null
    if (!dir) dir = hyperschema.dir

    hyperschema.linkAll()

    const root = path.resolve(dir)
    fs.mkdirSync(root, { recursive: true })

    const { header, source } = hyperschema.toCode()

    fs.writeFileSync(
      path.join(root, 'schema.json'),
      JSON.stringify(hyperschema.toJSON(), null, 2) + '\n',
      { encoding: 'utf-8' }
    )
    fs.writeFileSync(path.join(root, 'schema.h'), header, { encoding: 'utf-8' })
    fs.writeFileSync(path.join(root, 'schema.c'), source, { encoding: 'utf-8' })
  }
}

module.exports = CHyperschema
