// Microscore is a partial polyfill for Underscore.  It implements
// a subset of Underscore functions, and for some functions it
// implements a subset of the full functionality.
//
// Code written against Microscore should just work with Underscore.
// The reverse is not true, because Microscore doesn't support
// all features of every function.  A list of known differences
// between Underscore and Microscore is given with each function.
//
// This file should be curated to keep it small, so that it doesn't
// grow into Underscore.
//
// In the future, we'll figure out something better, like package
// slices and dead code elimination.

if (typeof _ !== 'undefined')
  throw new Error("If you have Underscore, don't use Microscore");

_ = {};

var hasOwnProperty = Object.prototype.hasOwnProperty;
var objectToString = Object.prototype.toString;

// Doesn't support more than two arguments (more than one "source"
// object).
_.extend = function (tgt, src) {
  for (var k in src) {
    if (hasOwnProperty.call(src, k))
      tgt[k] = src[k];
  }
  return tgt;
};

_.has = function (obj, key) {
  return hasOwnProperty.call(obj, key);
};

// Returns a copy of `array` with falsy elements removed.
_.compact = function (array) {
  var result = [];
  for (var i = 0; i < array.length; i++) {
    var item = array[i];
    if (item)
      result.push(item);
  }
  return result;
};

// Returns whether `array` contains an element that is
// `=== item`.
_.contains = function (array, item) {
  for (var i = 0; i < array.length; i++) {
    if (array[i] === item)
      return true;
  }
  return false;
};

// Returns `array` filtered to exclude elements that are
// `=== item`.  Similar to `_.without`.
_.without = function (array, item) {
  var result = [];
  for (var i = 0; i < array.length; i++) {
    var x = array[i];
    if (x !== item)
      result.push(x);
  }
  return result;
};

// Assembles an array by calling `func(oldElement, index)`
// on each element of `array`.  Assumes argument is an array.
_.map = function (array, func) {
  var result = new Array(array.length);
  for (var i = 0; i < array.length; i++) {
    result[i] = func(array[i], i);
  }
  return result;
};

// Given an array: Calls `func(element, index)` on each element of
// `array`.
//
// Given an object: Calls `func(value, key)` on each key/value of
// `obj`.
//
// Only REAL arrays are treated as arrays.  No Arguments objects, jQuery
// objects, etc.  This may be relaxed to the standard Meteor approach
// if it is too constraining.
//
// Doesn't accept `null` as first argument.  Doesn't delegate to built-in
// `forEach` (which is generally not faster anyway because it calls
// across the C/JS boundary).  Doesn't mess with JavaScript's built-in
// behavior if keys are added or removed during iteration (i.e. may
// or may not visit them).

_.each = function (arrayOrObject, func) {
  if (objectToString.call(arrayOrObject) === '[object Array]') {
    var array = arrayOrObject;
    for (var i = 0; i < array.length; i++) {
      func(array[i], i);
    }
  } else {
    var obj = arrayOrObject;
    for (var key in obj) {
      if (_.has(obj, key))
        func(obj[key], key);
    }
  }
};

_.bind = function (f, context) {
  return function () {
    return f.apply(target, context);
  };
};
