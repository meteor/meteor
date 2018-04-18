if (global.Date !== Date) {
  global.Date = Date;
}

if (global.parseInt !== parseInt) {
  global.parseInt = parseInt;
}

if (global.parseFloat !== parseFloat) {
  global.parseFloat = parseFloat;
}

var Sp = String.prototype;
if (Sp.replace !== originalStringReplace) {
  // Restore the original value of String#replace, because the es5-shim
  // reimplementation is buggy. See also import_globals.js.
  Sp.replace = originalStringReplace;
}
