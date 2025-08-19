/**
 * Internal full-featured implementation of lodash.template (inspired by v4.5.0)
 * embedded to eliminate the external dependency while preserving functionality.
 *
 * MIT License (c) JS Foundation and other contributors <https://js.foundation/>
 * Adapted for Meteor boilerplate-generator (only the pieces required by template were extracted).
 */

// ---------------------------------------------------------------------------
// Utility & regex definitions (mirroring lodash pieces used by template)
// ---------------------------------------------------------------------------

const reEmptyStringLeading = /\b__p \+= '';/g;
const reEmptyStringMiddle = /\b(__p \+=) '' \+/g;
const reEmptyStringTrailing = /(__e\(.*?\)|\b__t\)) \+\n'';/g;

const reEscape = /<%-([\s\S]+?)%>/g;              // escape delimiter
const reEvaluate = /<%([\s\S]+?)%>/g;              // evaluate delimiter
const reInterpolate = /<%=([\s\S]+?)%>/g;          // interpolate delimiter
const reEsTemplate = /\$\{([^\\}]*(?:\\.[^\\}]*)*)\}/g; // ES6 template literal capture
const reNoMatch = /($^)/;                            // matches nothing
const reUnescapedString = /['\\\n\r\u2028\u2029]/g; // string literal escapes
const reForbiddenIdentifierChars = /[()=,{}\[\]\/\s]/; // variable name safety

// HTML escape
const htmlEscapes = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const reHasUnescapedHtml = /[&<>"']/;

// Placeholder for undefined hash value (mirrors lodash constant)
const INVALID_TEMPL_VAR_ERROR_TEXT = 'Invalid `variable` option passed into `_.template`';

function escapeHtml(string) {
  return string && reHasUnescapedHtml.test(string)
    ? string.replace(/[&<>"']/g, chr => htmlEscapes[chr])
    : (string || '');
}

// Escape characters for inclusion into a string literal
const escapes = { "'": "'", '\\': '\\', '\n': 'n', '\r': 'r', '\u2028': 'u2028', '\u2029': 'u2029' };
function escapeStringChar(match) { return '\\' + escapes[match]; }

// Basic Object helpers ------------------------------------------------------
function isObject(value) { return value != null && typeof value === 'object'; }
function toStringSafe(value) { return value == null ? '' : (value + ''); }
function baseValues(object, props) { return props.map(k => object[k]); }


function attempt(fn) {
  try { return fn(); } catch (e) { return e; }
}
function isError(value) { return value instanceof Error || (isObject(value) && value.name === 'Error'); }

const templateSettings = {
  escape: reEscape,
  evaluate: reEvaluate,
  interpolate: /<%=([\s\S]+?)%>/g,
  imports: { '_': { escape: escapeHtml } },
  variable: ''
};

// ---------------------------------------------------------------------------
// Main template implementation
// ---------------------------------------------------------------------------
let templateCounter = -1; // used for sourceURL generation

function _template(string, options) {
  const settings = templateSettings;

  string = toStringSafe(string);

  // Since options is always null, use settings directly
  const imports = settings.imports;
  const importKeys = Object.keys(imports);
  const importValues = baseValues(imports, importKeys);

  let index = 0;
  let isEscaping;
  let isEvaluating;
  let source = "__p += '";

  const interpolate = settings.interpolate;

  // Build combined regex of delimiters
  const reDelimiters = RegExp(
    settings.escape.source + '|' +
    interpolate.source + '|' +
    (interpolate === reInterpolate ? reEsTemplate : reNoMatch).source + '|' +
    settings.evaluate.source + '|$'
  , 'g');

  const sourceURL = '//# sourceURL=' + ('lodash.templateSources[' + (++templateCounter) + ']') + '\n';

  // Tokenize
  string.replace(reDelimiters, function(match, escapeValue, interpolateValue, esTemplateValue, evaluateValue, offset) {
    interpolateValue || (interpolateValue = esTemplateValue);
    // Append preceding string portion with escaped literal chars
    source += string.slice(index, offset).replace(reUnescapedString, escapeStringChar);
    if (escapeValue) {
      isEscaping = true;
      source += "' +\n__e(" + escapeValue + ") +\n'";
    }
    if (evaluateValue) {
      isEvaluating = true;
      source += "';\n" + evaluateValue + ";\n__p += '";
    }
    if (interpolateValue) {
      source += "' +\n((__t = (" + interpolateValue + ")) == null ? '' : __t) +\n'";
    }
    index = offset + match.length;
    return match;
  });

  source += "';\n";

  // Since options is always null, variable is always empty, so always wrap with(obj)
  source = 'with (obj) {\n' + source + '\n}\n';

  // Remove unnecessary concatenations
  source = (isEvaluating ? source.replace(reEmptyStringLeading, '') : source)
    .replace(reEmptyStringMiddle, '$1')
    .replace(reEmptyStringTrailing, '$1;');

  // Frame as function body
  source = 'function(obj) {\n' +
    'obj || (obj = {});\n' +
    "var __t, __p = ''" +
    (isEscaping ? ', __e = _.escape' : '') +
    (isEvaluating
      ? ', __j = Array.prototype.join;\nfunction print() { __p += __j.call(arguments, \'\') }\n'
      : ';\n'
    ) +
    source +
    'return __p\n}';

  // Actual compile step
  const result = attempt(function() {
    return Function(importKeys, sourceURL + 'return ' + source).apply(undefined, importValues); // eslint-disable-line no-new-func
  });

  if (isError(result)) {
    result.source = source; // expose for debugging if error
    throw result;
  }
  // Expose compiled source
  result.source = source;
  return result;
}

export default function template(text) {
  return _template(text, null);
}
