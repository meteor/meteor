export function check(y) {
  // If the transform-do-expressions plugin is loaded correctly, there
  // will be no errors during the compilation of this file. Without the
  // plugin, the error will be: "SyntaxError: Unexpected token do".
  return do {
    y + y;
  };
}
