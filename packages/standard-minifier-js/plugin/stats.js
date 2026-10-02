import acorn from "acorn";

// The minifier can rename meteorInstall. Keep the same name discovery used by
// the original stats extractor so existing bundles retain their tree keys.
const meteorInstallRegExp = new RegExp([
  /\b(meteorInstall)\(\{/,
  /\b(\w+)=Package\.modules\.meteorInstall\b/,
  /\b(\w+)=Package\["modules-runtime"\].meteorInstall\b/,
  /\(0,Package\.modules\.(meteorInstall)\)\(/,
  /\(0,Package\["modules-runtime"\]\.(meteorInstall)\)\(/,
].map(expression => expression.source).join("|"));

const BYTE_COUNT_CHUNK_SIZE = 256 * 1024;
const tokenizerOptions = {
  ecmaVersion: "latest",
  sourceType: "script",
  allowAwaitOutsideFunction: true,
  allowImportExportEverywhere: true,
  allowReturnOutsideFunction: true,
  allowHashBang: true,
  checkPrivateFields: false,
};

/**
 * Count UTF-8 bytes without allocating a copy of a potentially enormous
 * module body. Keep surrogate pairs together at chunk boundaries.
 */
function byteLength(source, start, end) {
  let bytes = 0;

  while (start < end) {
    let next = Math.min(start + BYTE_COUNT_CHUNK_SIZE, end);
    const lastCodeUnit = source.charCodeAt(next - 1);

    if (next < end && lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff) {
      next++;
    }

    bytes += Buffer.byteLength(source.slice(start, next));
    start = next;
  }

  return bytes;
}

/**
 * Extract the module tree from minified JavaScript with memory proportional
 * to the nesting depth and the result. Acorn tokenizes the bundle but never
 * constructs an AST for the whole file.
 */
export function extractModuleSizesTree(source) {
  const match = meteorInstallRegExp.exec(source);
  if (!match) return;

  let meteorInstallName = "meteorInstall";
  match.some((name, index) => index > 0 && (meteorInstallName = name));

  const tokenizer = acorn.tokenizer(source, tokenizerOptions);
  const tree = Object.create(null);
  let token = tokenizer.getToken();

  function advance() {
    token = tokenizer.getToken();
  }

  function readValue(previousValue) {
    if (token.type.label === "{") {
      return readObject(previousValue);
    }

    const start = token.start;
    const delimiters = [];
    let end = start;

    while (token.type.label !== "eof") {
      const label = token.type.label;

      if (delimiters.length === 0 && (label === "," || label === "}")) {
        return byteLength(source, start, end);
      }

      if (label === "(" || label === "[" || label === "{" || label === "${") {
        delimiters.push(label);
      } else if (label === ")" || label === "]" || label === "}") {
        delimiters.pop();
      }

      end = token.end;
      advance();
    }

    throw new SyntaxError("Unterminated meteorInstall module value");
  }

  function readObject(previousValue) {
    const object = previousValue || Object.create(null);
    advance();

    while (token.type.label !== "}" && token.type.label !== "eof") {
      let key;

      if (token.type.label === "[") {
        advance();
        if (token.type.label === "string") key = token.value;
        advance();
        if (token.type.label !== "]") {
          throw new SyntaxError("Unsupported computed meteorInstall key");
        }
        advance();
      } else {
        if (token.type.label === "name" || token.type.label === "string" ||
            token.type.keyword) {
          key = token.value;
        }
        advance();
      }

      if (token.type.label !== ":") {
        throw new SyntaxError("Unsupported meteorInstall module property");
      }
      advance();

      const value = readValue(object[key]);
      if (typeof key === "string") object[key] = value;

      if (token.type.label === ",") advance();
    }

    if (token.type.label !== "}") {
      throw new SyntaxError("Unterminated meteorInstall module tree");
    }
    advance();

    return object;
  }

  while (token.type.label !== "eof") {
    if (token.value !== meteorInstallName) {
      advance();
      continue;
    }

    advance();
    // Minifiers can express the callee as (0,Package.modules.meteorInstall).
    if (token.type.label === ")") advance();
    if (token.type.label !== "(") continue;
    advance();
    if (token.type.label !== "{") continue;

    readObject(tree);
  }

  return tree;
}
