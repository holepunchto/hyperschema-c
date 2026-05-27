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

test('fixed32 field - correct C type and functions', (t) => {
  const schema = new CHyperschema(null, { versioned: false })
  const ns = schema.namespace('ns1')
  ns.register({
    name: 'node',
    fields: [{ name: 'hash', type: 'fixed32', required: true }]
  })
  const { header, source } = schema.toCode()
  t.ok(header.includes('uint8_t hash[32];'), 'fixed32 field type')
  t.ok(source.includes('compact_preencode_fixed32(state, value->hash)'), 'preencode fixed32')
  t.ok(source.includes('compact_encode_fixed32(state, value->hash)'), 'encode fixed32')
  t.ok(source.includes('compact_decode_fixed32(state, result->hash)'), 'decode fixed32 (no &)')
})

test('fixed64 field - correct C type and functions', (t) => {
  const schema = new CHyperschema(null, { versioned: false })
  const ns = schema.namespace('ns1')
  ns.register({
    name: 'key',
    fields: [{ name: 'data', type: 'fixed64', required: true }]
  })
  const { header, source } = schema.toCode()
  t.ok(header.includes('uint8_t data[64];'), 'fixed64 field type')
  t.ok(source.includes('compact_preencode_fixed64(state, value->data)'), 'preencode fixed64')
  t.ok(source.includes('compact_encode_fixed64(state, value->data)'), 'encode fixed64')
  t.ok(source.includes('compact_decode_fixed64(state, result->data)'), 'decode fixed64 (no &)')
})

test('bool field - correct C type and functions', (t) => {
  const schema = new CHyperschema(null, { versioned: false })
  const ns = schema.namespace('ns1')
  ns.register({
    name: 'flags',
    fields: [{ name: 'active', type: 'bool', required: true }]
  })
  const { header, source } = schema.toCode()
  t.ok(header.includes('#include <stdbool.h>'), 'stdbool.h included for bool field')
  t.ok(header.includes('bool active;'), 'bool field type')
  t.ok(source.includes('compact_preencode_bool(state, value->active)'), 'preencode bool')
  t.ok(source.includes('compact_encode_bool(state, value->active)'), 'encode bool')
  t.ok(source.includes('compact_decode_bool(state, &result->active)'), 'decode bool')
})

test('buffer field - correct C members and functions', (t) => {
  const schema = new CHyperschema(null, { versioned: false })
  const ns = schema.namespace('ns1')
  ns.register({
    name: 'msg',
    fields: [{ name: 'data', type: 'buffer', required: true }]
  })
  const { header, source } = schema.toCode()
  t.ok(header.includes('uint8_t *data; /* borrows from decode buffer */'), 'buffer pointer field')
  t.ok(header.includes('size_t data_len;'), 'buffer length field')
  t.ok(
    source.includes('compact_preencode_uint8array(state, value->data, value->data_len)'),
    'preencode buffer'
  )
  t.ok(
    source.includes('compact_encode_uint8array(state, value->data, value->data_len)'),
    'encode buffer'
  )
  t.ok(
    source.includes('compact_decode_uint8array(state, &result->data, &result->data_len)'),
    'decode buffer'
  )
})

test('string field - correct C member and functions', (t) => {
  const schema = new CHyperschema(null, { versioned: false })
  const ns = schema.namespace('ns1')
  ns.register({
    name: 'msg',
    fields: [{ name: 'title', type: 'string', required: true }]
  })
  const { header, source } = schema.toCode()
  t.ok(
    header.includes('utf8_string_view_t title; /* borrows from decode buffer */'),
    'string view field'
  )
  t.ok(source.includes('compact_preencode_utf8(state, value->title)'), 'preencode string')
  t.ok(source.includes('compact_encode_utf8(state, value->title)'), 'encode string')
  t.ok(source.includes('compact_decode_utf8(state, &result->title)'), 'decode string')
})

test('json field - same wire format as string', (t) => {
  const schema = new CHyperschema(null, { versioned: false })
  const ns = schema.namespace('ns1')
  ns.register({
    name: 'doc',
    fields: [{ name: 'payload', type: 'json', required: true }]
  })
  const { header, source } = schema.toCode()
  t.ok(
    header.includes('utf8_string_view_t payload; /* borrows from decode buffer */'),
    'json uses utf8_string_view_t'
  )
  t.ok(source.includes('compact_preencode_utf8(state, value->payload)'), 'preencode json')
  t.ok(source.includes('compact_encode_utf8(state, value->payload)'), 'encode json')
  t.ok(source.includes('compact_decode_utf8(state, &result->payload)'), 'decode json')
})

test('required array of uint - correct C members and encode/decode', (t) => {
  const schema = new CHyperschema(null, { versioned: false })
  const ns = schema.namespace('ns1')
  ns.register({
    name: 'list',
    fields: [{ name: 'items', type: 'uint', required: true, array: true }]
  })
  const { header, source } = schema.toCode()
  t.ok(header.includes('uintmax_t *items; /* array */'), 'array pointer field')
  t.ok(header.includes('size_t items_len;'), 'array length field')
  t.ok(!header.includes('bool has_items'), 'no has_ for required array')
  t.ok(source.includes('compact_preencode_uint(state, value->items_len)'), 'preencode length')
  t.ok(source.includes('for (size_t _i = 0; _i < value->items_len; _i++)'), 'preencode loop')
  t.ok(source.includes('compact_preencode_uint(state, value->items[_i])'), 'preencode element')
  t.ok(source.includes('compact_encode_uint(state, value->items_len)'), 'encode length')
  t.ok(source.includes('compact_encode_uint(state, value->items[_i])'), 'encode element')
  t.ok(source.includes('compact_decode_uint(state, &_count)'), 'decode count')
  t.ok(source.includes('calloc(_count, sizeof(*result->items))'), 'calloc')
  t.ok(
    source.includes('if (result->items == NULL && _count > 0) { err = -1; goto fail; }\n'),
    'calloc null check uses goto fail'
  )
  t.ok(source.includes('compact_decode_uint(state, &result->items[_i])'), 'decode element')
  t.ok(source.includes('goto fail'), 'decode errors goto fail')
  t.ok(source.includes('fail:'), 'fail label present')
  t.ok(source.includes('ns1_list_destroy(result)'), 'fail label calls destroy')
  t.ok(source.includes('#include <stdlib.h>'), 'stdlib.h for calloc')
  t.ok(header.includes('ns1_list_destroy'), '_destroy declared in header')
  t.ok(source.includes('void\nns1_list_destroy'), '_destroy implemented in source')
  t.ok(source.includes('free(result->items)'), '_destroy frees array field')
})

test('optional array of uint - has_ flag and conditional encode/decode', (t) => {
  const schema = new CHyperschema(null, { versioned: false })
  const ns = schema.namespace('ns1')
  ns.register({
    name: 'bag',
    fields: [{ name: 'values', type: 'uint', array: true }]
  })
  const { header, source } = schema.toCode()
  t.ok(header.includes('bool has_values;'), 'has_ flag for optional array')
  t.ok(source.includes('uintmax_t flags = 0;'), 'flags variable')
  t.ok(source.includes('if (value->has_values)'), 'conditional encode')
  t.ok(source.includes('if (result->has_values)'), 'conditional decode')
})

test('required array of fixed32 - pointer-to-array type and no & in decode', (t) => {
  const schema = new CHyperschema(null, { versioned: false })
  const ns = schema.namespace('ns1')
  ns.register({
    name: 'chain',
    fields: [{ name: 'hashes', type: 'fixed32', required: true, array: true }]
  })
  const { header, source } = schema.toCode()
  t.ok(header.includes('uint8_t (*hashes)[32]; /* array of fixed32 */'), 'pointer-to-array type')
  t.ok(source.includes('compact_preencode_fixed32(state, value->hashes[_i])'), 'preencode element')
  t.ok(source.includes('compact_encode_fixed32(state, value->hashes[_i])'), 'encode element')
  t.ok(source.includes('compact_decode_fixed32(state, result->hashes[_i])'), 'decode (no &)')
  t.ok(source.includes('calloc(_count, sizeof(*result->hashes))'), 'calloc with correct size')
})

test('float32 field - correct C type and functions', (t) => {
  const schema = new CHyperschema(null, { versioned: false })
  const ns = schema.namespace('ns1')
  ns.register({
    name: 'measurement',
    fields: [{ name: 'value', type: 'float32', required: true }]
  })
  const { header, source } = schema.toCode()
  t.ok(header.includes('float value;'), 'float32 field is float')
  t.ok(source.includes('compact_preencode_float32(state, value->value)'), 'preencode float32')
  t.ok(source.includes('compact_encode_float32(state, value->value)'), 'encode float32')
  t.ok(source.includes('compact_decode_float32(state, &result->value)'), 'decode float32')
})

test('float64 field - correct C type and functions', (t) => {
  const schema = new CHyperschema(null, { versioned: false })
  const ns = schema.namespace('ns1')
  ns.register({
    name: 'precise',
    fields: [{ name: 'value', type: 'float64', required: true }]
  })
  const { header, source } = schema.toCode()
  t.ok(header.includes('double value;'), 'float64 field is double')
  t.ok(source.includes('compact_preencode_float64(state, value->value)'), 'preencode float64')
  t.ok(source.includes('compact_encode_float64(state, value->value)'), 'encode float64')
  t.ok(source.includes('compact_decode_float64(state, &result->value)'), 'decode float64')
})

test('unsupported type throws', (t) => {
  const schema = new CHyperschema(null, { versioned: false })
  const ns = schema.namespace('ns1')
  ns.register({
    name: 'item',
    fields: [{ name: 'n', type: 'lexint', required: true }]
  })
  t.exception(() => schema.toCode(), { code: 'UNSUPPORTED_TYPE' })
})
