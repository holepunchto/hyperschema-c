# hyperschema-c

C code generation for [Hyperschema](https://github.com/holepunchto/hyperschema). Transforms schema definitions into C structs with preencode/encode/decode functions using [libcompact](https://github.com/holepunchto/libcompact).

```
npm i hyperschema-c
```

## Usage

```js
const CHyperschema = require('hyperschema-c')

const schema = CHyperschema.from('./spec')

// Get generated C source as strings
const { header, source } = schema.toCode()

// Or write schema.h and schema.c to disk
CHyperschema.toDisk(schema, './output')
```

`toDisk` writes:

```
output/
  schema.h
  schema.c
  schema.json
```

## License

Apache-2.0
