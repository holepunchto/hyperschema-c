const path = require('path')
const test = require('brittle')
const CHyperschema = require('..')
const fixturesDir = path.join(path.dirname(require.resolve('hyperschema-test/package')), 'fixtures')

test('required uint only - header', (t) => {
  const schema = CHyperschema.from(path.join(fixturesDir, '27'))
  const { header } = schema.toCode()

  t.ok(header.includes('#ifndef NS27_SCHEMA_H'), 'namespaced include guard')
  t.ok(header.includes('typedef struct ns27_counter_s {'), 'struct typedef')
  t.ok(header.includes('uintmax_t value;'), 'uint field')
  t.ok(!header.includes('bool has_'), 'no has_ for required fields')
  t.ok(header.includes('ns27_counter_preencode'), 'preencode declaration')
  t.ok(header.includes('ns27_counter_encode'), 'encode declaration')
  t.ok(header.includes('ns27_counter_decode'), 'decode declaration')
})

test('required uint only - source', (t) => {
  const schema = CHyperschema.from(path.join(fixturesDir, '27'))
  const { source } = schema.toCode()

  t.ok(source.includes('#include "schema.h"'), 'includes schema.h')
  t.ok(source.includes('compact_preencode_uint(state, value->value)'), 'preencode uint')
  t.ok(source.includes('compact_encode_uint(state, value->value)'), 'encode uint')
  t.ok(source.includes('compact_decode_uint(state, &result->value)'), 'decode uint')
  t.ok(!source.includes('flags'), 'no flags for all-required struct')
})

test('optional uint - has_ and flags', (t) => {
  const schema = new CHyperschema(null, { versioned: false })
  const ns = schema.namespace('ns1')
  ns.register({
    name: 'item',
    fields: [
      { name: 'id', type: 'uint', required: true },
      { name: 'count', type: 'uint' }
    ]
  })
  const { header, source } = schema.toCode()

  t.ok(header.includes('bool has_count;'), 'has_ field in struct')
  t.ok(source.includes('uintmax_t flags = 0;'), 'flags variable in encode')
  t.ok(source.includes('flags |= ((uintmax_t)1 << 0)'), 'flag bit set for count')
  t.ok(
    source.includes('result->has_count = (flags & ((uintmax_t)1 << 0)) != 0'),
    'flag bit read in decode'
  )
  t.ok(source.includes('if (value->has_count)'), 'conditional encode')
  t.ok(source.includes('if (result->has_count)'), 'conditional decode')
})

test('int field - correct C type and functions', (t) => {
  const schema = new CHyperschema(null, { versioned: false })
  const ns = schema.namespace('ns1')
  ns.register({
    name: 'point',
    fields: [
      { name: 'x', type: 'int', required: true },
      { name: 'y', type: 'int', required: true }
    ]
  })
  const { header, source } = schema.toCode()
  t.ok(header.includes('intmax_t x;'), 'int field is intmax_t')
  t.ok(header.includes('intmax_t y;'), 'int field is intmax_t')
  t.ok(source.includes('compact_preencode_int(state, value->x)'), 'preencode int')
  t.ok(source.includes('compact_encode_int(state, value->x)'), 'encode int')
  t.ok(source.includes('compact_decode_int(state, &result->x)'), 'decode int')
})

test('fixed-width uint fields - correct C types and functions', (t) => {
  const schema = new CHyperschema(null, { versioned: false })
  const ns = schema.namespace('ns1')
  ns.register({
    name: 'widths',
    fields: [
      { name: 'a', type: 'uint8', required: true },
      { name: 'b', type: 'uint16', required: true },
      { name: 'c', type: 'uint32', required: true },
      { name: 'd', type: 'uint64', required: true }
    ]
  })
  const { header, source } = schema.toCode()
  t.ok(header.includes('uint8_t a;'), 'uint8 field')
  t.ok(header.includes('uint16_t b;'), 'uint16 field')
  t.ok(header.includes('uint32_t c;'), 'uint32 field')
  t.ok(header.includes('uint64_t d;'), 'uint64 field')
  t.ok(source.includes('compact_preencode_uint8(state, value->a)'), 'preencode uint8')
  t.ok(source.includes('compact_encode_uint32(state, value->c)'), 'encode uint32')
  t.ok(source.includes('compact_decode_uint64(state, &result->d)'), 'decode uint64')
})


test('signed fixed-width int fields - correct C types and functions', (t) => {
  const schema = new CHyperschema(null, { versioned: false })
  const ns = schema.namespace('ns1')
  ns.register({
    name: 'signed',
    fields: [
      { name: 'a', type: 'int8', required: true },
      { name: 'b', type: 'int16', required: true },
      { name: 'c', type: 'int32', required: true },
      { name: 'd', type: 'int64', required: true }
    ]
  })
  const { header, source } = schema.toCode()
  t.ok(header.includes('int8_t a;'), 'int8 field')
  t.ok(header.includes('int16_t b;'), 'int16 field')
  t.ok(header.includes('int32_t c;'), 'int32 field')
  t.ok(header.includes('int64_t d;'), 'int64 field')
  t.ok(source.includes('compact_encode_int8(state, value->a)'), 'encode int8')
  t.ok(source.includes('compact_decode_int32(state, &result->c)'), 'decode int32')
})

test('unsupported type throws', (t) => {
  const schema = CHyperschema.from(path.join(fixturesDir, '1'))
  t.exception(() => schema.toCode(), /unsupported field type "string"/)
})
