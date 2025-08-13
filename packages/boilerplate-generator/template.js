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
function isFunction(value) { return typeof value === 'function'; }
function toStringSafe(value) { return value == null ? '' : (value + ''); }
function keys(obj) { return Object.keys(obj); }
function baseValues(object, props) { return props.map(k => object[k]); }

// assignInWith/customDefaultsAssignIn replicate lodash merge behavior for template
function customDefaultsAssignIn(objValue, srcValue, key, object) {
  if (objValue === undefined || (objValue === Object.prototype[key] && !Object.prototype.hasOwnProperty.call(object, key))) {
    return srcValue;
  }
  return objValue;
}
function assignInWith(object, ...sources) {
  const customizer = sources.pop();
  for (const src of sources) {
    if (!isObject(src)) continue;
    for (const k of Object.keys(src)) {
      const newVal = customizer(object[k], src[k], k, object, src);
      if (newVal !== undefined) object[k] = newVal;
    }
  }
  return object;
}

function attempt(fn) {
  try { return fn(); } catch (e) { return e; }
}
function isError(value) { return value instanceof Error || (isObject(value) && value.name === 'Error'); }

// Simple iteratee call guard detection (lightweight approximation)
function isIterateeCall(value, index, object) {
  if (!isObject(object)) return false;
  const type = typeof index;
  if (type === 'number') {
    return Array.isArray(object) && index < object.length && object[index] === value;
  }
  if (type === 'string' && index in object) {
    return object[index] === value;
  }
  return false;
}

// ---------------------------------------------------------------------------
// templateSettings (exportable & mutable like lodash)
// ---------------------------------------------------------------------------
export const templateSettings = {
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

export default function template(string, options, guard) {
  const settings = templateSettings;

  if (guard && isIterateeCall(string, options, guard)) {
    options = undefined;
  }
  string = toStringSafe(string);

  options = assignInWith({}, options || {}, settings, customDefaultsAssignIn);

  // Merge imports
  const imports = assignInWith({}, options.imports || {}, settings.imports, customDefaultsAssignIn);
  const importKeys = keys(imports);
  const importValues = baseValues(imports, importKeys);

  let index = 0;
  let isEscaping;
  let isEvaluating;
  let source = "__p += '";

  const interpolate = options.interpolate || reNoMatch;

  // Build combined regex of delimiters
  const reDelimiters = RegExp(
    (options.escape || reNoMatch).source + '|' +
    interpolate.source + '|' +
    (interpolate === reInterpolate ? reEsTemplate : reNoMatch).source + '|' +
    (options.evaluate || reNoMatch).source + '|$'
  , 'g');

  const sourceURL = '//# sourceURL=' + (
    Object.prototype.hasOwnProperty.call(options, 'sourceURL')
      ? (options.sourceURL + '').replace(/\s/g, ' ')
      : ('lodash.templateSources[' + (++templateCounter) + ']')
  ) + '\n';

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

  const variable = Object.prototype.hasOwnProperty.call(options, 'variable') && options.variable;
  if (!variable) {
    // Wrap with(obj) for implicit data object
    source = 'with (obj) {\n' + source + '\n}\n';
  } else if (reForbiddenIdentifierChars.test(variable)) {
    throw new Error(INVALID_TEMPL_VAR_ERROR_TEXT);
  }

  // Remove unnecessary concatenations
  source = (isEvaluating ? source.replace(reEmptyStringLeading, '') : source)
    .replace(reEmptyStringMiddle, '$1')
    .replace(reEmptyStringTrailing, '$1;');

  // Frame as function body
  source = 'function(' + (variable || 'obj') + ') {\n' +
    (variable ? '' : 'obj || (obj = {});\n') +
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

// Provide _.escape equivalent via templateSettings.imports._.escape
// Already supplied above. If external code mutates templateSettings, we honor it.