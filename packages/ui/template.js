

// All right, this is a little crazy, but let's try it for the demo.
//
// `Template.foo({ ... props ... })` sets properties on an underlying
// Component object.  `Template.foo()` (with `arguments.length === 0`)
// returns this underlying object.
//
// We can't easily have the `Template.foo({...})` syntax and have
// `Template.foo` actually *be* a Component, because making Components
// sometimes have typeof function would complicate things a lot.
// However, we can make `Template.foo` just as good in situations where
// a function will do (templates, `buf.write`) and when that doesn't
// work you can write `Template.foo()` instead.
//
// The potential downside is that this is just too confusing.

var chainers = { init: 1, rendered: 1, destroyed: 1 };

UI.makeTemplate = function (underlying) {
  return function (options) {
    if (! arguments.length)
      return underlying;

    for (var k in options) {
      if (options.hasOwnProperty(k)) {
        var oldProp = underlying[k];
        var givenProp = options[k];

        if (chainers.hasOwnProperty(k)) {
          // init, rendered, destroyed
          if (typeof oldProp === 'function') {
            underlying[k] = (function (oldCb) {
              return function () {
                oldCb.call(underlying);
                givenProp.call(underlying);
              };
            })(oldProp);
          } else {
            underlying[k] = givenProp;
          }
        } else if (typeof givenProp === 'function') {
          // helper
          underlying[k] = function (/**/) {
            var data = this.get();
            return givenProp.apply(data, arguments);
          };
        } else {
          underlying[k] = givenProp;
        }
      }
    }

    // no use case for this return value, but maybe making it
    // same as no-arg form is less weird.
    return underlying;
  };
};