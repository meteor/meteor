// `cordova-lib` depends on `shelljs`, which modifies String.prototype
// (which is BAD).  See:
// https://github.com/arturadib/shelljs/issues/159
//
// The following code protects the tool environment (which is also
// where build plugins run) from having a polluted String.prototype.
// One JS library in particular, String.js (before v3.3.1), is
// sensitive to String prototype pollution.
//
// Fortunately, `cordova-lib` does not seem to rely on the presence of
// `String#to` or `String#toEnd` (or this code would break it).
//
// This code can be removed when `shelljs` cleans up its act and
// `cordova-lib` uses a new version, or when `cordova-lib` moves away
// from `shelljs`.

Object.defineProperty(String.prototype, 'to', { set: function () {} });
Object.defineProperty(String.prototype, 'toEnd', { set: function () {} });
