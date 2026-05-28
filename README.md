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

// Or write the generated files to disk
CHyperschema.toDisk(schema, './output')
```

`toDisk` writes:

```
output/
  <target>.h
  <target>.c
  schema.json
  CMakeLists.txt
```

where `<target>` is derived from the schema's namespaces — `<ns>_schema` for a single namespace, `<ns1>_<ns2>_schema` for multiple. A schema in namespace `hc` produces `hc_schema.h` and `hc_schema.c`.

## License

Apache-2.0
