var hasOwn = Object.prototype.hasOwnProperty;

function wrap(method) {
  var original = console[method];
  if (original && typeof original === "object") {
    // Turn callable console method objects into actual functions.
    console[method] = function () {
      return Function.prototype.apply.call(
        original, console, arguments
      );
    };
  }
}

if (typeof console === "object" &&
    // In older Internet Explorers, methods like console.log are actually
    // callable objects rather than functions.
    typeof console.log === "object") {
  for (var method in console) {
    // In most browsers, this hasOwn check will fail for all console
    // methods anyway, but fortunately in IE8 the method objects we care
    // about are own properties.
    if (hasOwn.call(console, method)) {
      wrap(method);
    }
  }
}
