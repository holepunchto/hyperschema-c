"use strict";

const test = require("brittle");
const CHyperschema = require(".");

test("required uint only - header", (t) => {
  const schema = CHyperschema.from("../hyperschema-fixtures/fixtures/27");
  const { header } = schema.toCode();

  t.ok(header.includes("#ifndef NS27_SCHEMA_H"), "namespaced include guard");
  t.ok(header.includes("typedef struct ns27_counter_s {"), "struct typedef");
  t.ok(header.includes("uintmax_t value;"), "uint field");
  t.ok(!header.includes("bool has_"), "no has_ for required fields");
  t.ok(header.includes("ns27_counter_preencode"), "preencode declaration");
  t.ok(header.includes("ns27_counter_encode"), "encode declaration");
  t.ok(header.includes("ns27_counter_decode"), "decode declaration");
});

test("required uint only - source", (t) => {
  const schema = CHyperschema.from("../hyperschema-fixtures/fixtures/27");
  const { source } = schema.toCode();

  t.ok(source.includes('#include "schema.h"'), "includes schema.h");
  t.ok(
    source.includes("compact_preencode_uint(state, value->value)"),
    "preencode uint",
  );
  t.ok(
    source.includes("compact_encode_uint(state, value->value)"),
    "encode uint",
  );
  t.ok(
    source.includes("compact_decode_uint(state, &result->value)"),
    "decode uint",
  );
  t.ok(!source.includes("flags"), "no flags for all-required struct");
});

test("optional uint - has_ and flags", (t) => {
  const schema = new CHyperschema(null, { versioned: false });
  const ns = schema.namespace("ns1");
  ns.register({
    name: "item",
    fields: [
      { name: "id", type: "uint", required: true },
      { name: "count", type: "uint" },
    ],
  });
  const { header, source } = schema.toCode();

  t.ok(header.includes("bool has_count;"), "has_ field in struct");
  t.ok(source.includes("uintmax_t flags = 0;"), "flags variable in encode");
  t.ok(source.includes("flags |= (1u << 0)"), "flag bit set for count");
  t.ok(
    source.includes("result->has_count = (flags & (1u << 0)) != 0"),
    "flag bit read in decode",
  );
  t.ok(source.includes("if (value->has_count)"), "conditional encode");
  t.ok(source.includes("if (result->has_count)"), "conditional decode");
});

test("unsupported type throws", (t) => {
  const schema = CHyperschema.from("../hyperschema-fixtures/fixtures/1");
  t.exception(() => schema.toCode(), /only uint is supported/);
});
