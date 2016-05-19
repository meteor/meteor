// `cordova-lib` depends on `shelljs`, which modifies String.prototype
// (which is BAD).  See:
// https://github.com/arturadib/shelljs/issues/159
//
// The following code protects the tool environment (which is also
// where build plugins run) from having a polluted String.prototype.
// One JS library in particular, String.js (before v3.3.1), is
// sensitive to String prototype pollution.
//
// This code can be removed when `shelljs` cleans up its act and
// `cordova-lib` uses a new version, or when `cordova-lib` moves away
// from `shelljs`.

function makeDescriptor() {
  let value;

  // This descriptor allows the property to remain non-enumerable while
  // still permitting controlled modifications of its value.
  return {
    enumerable: false,

    get() {
      return value;
    },

    set(newValue) {
      if (typeof newValue === "function") {
        value = function () {
          // Ignore calls that likely originate from
          // https://github.com/jprichardson/string.js/blob/adc2e9d1b8/lib/string.js#L726
          if (arguments.length > 0 ||
              this != "teststring") {
            return newValue.apply(this, arguments);
          }
        };
      } else {
        value = newValue;
      }

      return newValue;
    }
  };
}

Object.defineProperties(String.prototype, {
  to: makeDescriptor(),
  toEnd: makeDescriptor()
});
