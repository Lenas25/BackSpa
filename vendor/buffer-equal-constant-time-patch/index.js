'use strict';

// Local trusted replacement for the unmaintained `buffer-equal-constant-time`
// package. The original implementation references `require('buffer').SlowBuffer`
// at module-load time; Node.js removed `SlowBuffer` (deprecated since Node 6,
// fully removed in modern Node releases), so importing the original module
// throws `TypeError: Cannot read properties of undefined (reading 'prototype')`
// as soon as anything requires it transitively (jwa -> jws -> jsonwebtoken ->
// @nestjs/jwt / passport-jwt -> AuthGuard).
//
// This shim keeps the exact same public API (`bufferEq(a, b)`, used by `jwa`)
// but performs the constant-time comparison with Node's built-in
// `crypto.timingSafeEqual`, which is the modern, actively maintained
// equivalent of what this package originally provided by hand.
//
// Wired in via npm "overrides" in package.json — see that file for rationale.
var timingSafeEqual = require('crypto').timingSafeEqual;

module.exports = bufferEq;

function bufferEq(a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    return false;
  }

  // Length is not secret data (already true of the original implementation),
  // so it is safe to short-circuit here; `timingSafeEqual` requires equal
  // lengths and would otherwise throw instead of returning false.
  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
}
