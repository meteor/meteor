UNIMPLEMENTED = function () {
  throw new Error("Unimplemented");
};

if (!Array.prototype.map) {
  Array.prototype.map = function (f) {
    var len = this.length;
    var ret = new Array(len);
    for (var i = 0; i < len; i++)
      ret[i] = f(this[i]);
    return ret;
  };
}

// https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Function/bind
if (!Function.prototype.bind) {
  Function.prototype.bind = function( obj ) {
    var slice = [].slice,
      args = slice.call(arguments, 1),
      self = this,
      nop = function () {},
      bound = function () {
        return self.apply(this instanceof nop ? this : ( obj || {} ),
                          args.concat( slice.call(arguments) ) );
      };
    nop.prototype = self.prototype;
    bound.prototype = new nop();
    return bound;
  };
}

// https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Array/indexOf
if (!Array.prototype.indexOf)
{
  Array.prototype.indexOf = function(searchElement /*, fromIndex */)
  {
    "use strict";

    if (this === void 0 || this === null)
      throw new TypeError();

    var t = Object(this);
    var len = t.length >>> 0;
    if (len === 0)
      return -1;

    var n = 0;
    if (arguments.length > 0)
    {
      n = Number(arguments[1]);
      if (n !== n) // shortcut for verifying if it's NaN
        n = 0;
      else if (n !== 0 && n !== (1 / 0) && n !== -(1 / 0))
        n = (n > 0 || -1) * Math.floor(Math.abs(n));
    }

    if (n >= len)
      return -1;

    var k = n >= 0
          ? n
          : Math.max(len - Math.abs(n), 0);

    for (; k < len; k++)
    {
      if (k in t && t[k] === searchElement)
        return k;
    }
    return -1;
  };
}

// https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Array/filterif (!Array.prototype.filter)
{
  Array.prototype.filter = function(fun /*, thisp */)
  {
    "use strict";

    if (this === void 0 || this === null)
      throw new TypeError();

    var t = Object(this);
    var len = t.length >>> 0;
    if (typeof fun !== "function")
      throw new TypeError();

    var res = [];
    var thisp = arguments[1];
    for (var i = 0; i < len; i++)
    {
      if (i in t)
      {
        var val = t[i]; // in case fun mutates this
        if (fun.call(thisp, val, i, t))
          res.push(val);
      }
    }

    return res;
  };
}


//https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Array/ForEach
// Production steps of ECMA-262, Edition 5, 15.4.4.18
if ( !Array.prototype.forEach ) {

  Array.prototype.forEach = function( callbackfn, thisArg ) {

    var T,
      O = Object(this),
      len = O.length >>> 0,
      k = 0;

    // If no callback function or if callback is not a callable function
    if ( !callbackfn || !callbackfn.call ) {
      throw new TypeError();
    }

    // If the optional thisArg context param was provided,
    // Set as this context
    if ( thisArg ) {
      T = thisArg;
    }

    while( k < len ) {
      // Store property key string object reference
      var Pk = String( k ),
        // Determine if property key is present in this object context
        kPresent = O.hasOwnProperty( Pk ),
        kValue;

      if ( kPresent ) {
        // Dereference and store the value of this Property key
        kValue = O[ Pk ];

        // Invoke the callback function with call, passing arguments:
        // context, property value, property key, thisArg object context
        callbackfn.call( T, kValue, k, O );
      }

      k++;
    }
  };
}

/// http://snipplr.com/view/26662/get-url-parameters-with-jquery--improved/
///
/// XXX should this be here? It is client-only (references window).
/// XXX no. move elsewhere, and probably put in a namespace
var getUrlParam = function(name){
  var results = new RegExp('[\\?&]' + name + '=([^&#]*)').exec(
    window.location.href);
  if (!results) { return null; }
  return results[1] || null;
}

/**
 * Wait a little while, then call a function. But, if another call to
 * coalesce is made with the same key while we're waiting, then forget
 * the first call (and begin waiting anew for the second call.) In
 * other words, coalesce all of the calls to the function that occur
 * within a certain duration of each other into once call.
 *
 * @param key {String} arbitrary value to identify calls to coalesce
 * @param duration {Number} how long to wait, in milliseconds
 * @param f {Function} the function to call
 */
var coalesce = (function() {
  var timers = {};
  return function (key, duration, f) {
    if (key in timers) {
      clearTimeout(timers[key]);
      delete timers[key];
    }
    timers[key] = setTimeout(function () {
      delete timers[key];
      f();
    }, duration);
  };
})();

/**
 * Wait for N asynchronous functions to complete, then call another
 * function. Best explained by example:
 *
 * waitForN(3, function (finish) {
 *   var results = [];
 *   var collect = function (answer) {
 *     results.push(g);
 *     finish();
 *   };
 *
 *   askYourMom(collect);
 *   askYourDad(collect);
 *   askYourSister(collect);
 * }, function () {
 *   // .. do something with 'results' ..
 * });
 */
var waitForN = function (n, start, after) {
  return start(function () {
    n--;
    if (n === 0)
      after();
  });
};


