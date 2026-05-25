'use strict'

module.exports = class CodegenError extends Error {
  constructor(msg, code, fn = CodegenError) {
    super(`${code}: ${msg}`)
    this.code = code

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, fn)
    }
  }

  get name() {
    return 'CodegenError'
  }

  static UNSUPPORTED_TYPE(msg) {
    return new CodegenError(msg, 'UNSUPPORTED_TYPE', CodegenError.UNSUPPORTED_TYPE)
  }

  static UNRESOLVED_TYPE(msg) {
    return new CodegenError(msg, 'UNRESOLVED_TYPE', CodegenError.UNRESOLVED_TYPE)
  }

  static EMPTY_SCHEMA(msg) {
    return new CodegenError(msg, 'EMPTY_SCHEMA', CodegenError.EMPTY_SCHEMA)
  }
}
