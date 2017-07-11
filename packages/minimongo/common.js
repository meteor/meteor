import {LocalCollection} from './local_collection.js';

// Each element selector contains:
//  - compileElementSelector, a function with args:
//    - operand - the "right hand side" of the operator
//    - valueSelector - the "context" for the operator (so that $regex can find
//      $options)
//    - matcher - the Matcher this is going into (so that $elemMatch can compile
//      more things)
//    returning a function mapping a single value to bool.
//  - dontExpandLeafArrays, a bool which prevents expandArraysInBranches from
//    being called
//  - dontIncludeLeafArrays, a bool which causes an argument to be passed to
//    expandArraysInBranches if it is called
export const ELEMENT_OPERATORS = {
  $lt: makeInequality(cmpValue => cmpValue < 0),
  $gt: makeInequality(cmpValue => cmpValue > 0),
  $lte: makeInequality(cmpValue => cmpValue <= 0),
  $gte: makeInequality(cmpValue => cmpValue >= 0),
  $mod: {
    compileElementSelector(operand) {
      if (!(Array.isArray(operand) && operand.length === 2
            && typeof(operand[0]) === 'number'
            && typeof(operand[1]) === 'number')) {
        throw Error("argument to $mod must be an array of two numbers");
      }
      // XXX could require to be ints or round or something
      const divisor = operand[0];
      const remainder = operand[1];
      return value => typeof value === 'number' && value % divisor === remainder;
    }
  },
  $in: {
    compileElementSelector(operand) {
      if (!Array.isArray(operand))
        throw Error("$in needs an array");

      const elementMatchers = [];
      operand.forEach(option => {
        if (option instanceof RegExp)
          elementMatchers.push(regexpElementMatcher(option));
        else if (isOperatorObject(option))
          throw Error("cannot nest $ under $in");
        else
          elementMatchers.push(equalityElementMatcher(option));
      });

      return value => {
        // Allow {a: {$in: [null]}} to match when 'a' does not exist.
        if (value === undefined)
          value = null;
        return elementMatchers.some(e => e(value));
      };
    }
  },
  $size: {
    // {a: [[5, 5]]} must match {a: {$size: 1}} but not {a: {$size: 2}}, so we
    // don't want to consider the element [5,5] in the leaf array [[5,5]] as a
    // possible value.
    dontExpandLeafArrays: true,
    compileElementSelector(operand) {
      if (typeof operand === 'string') {
        // Don't ask me why, but by experimentation, this seems to be what Mongo
        // does.
        operand = 0;
      } else if (typeof operand !== 'number') {
        throw Error("$size needs a number");
      }
      return value => Array.isArray(value) && value.length === operand;
    }
  },
  $type: {
    // {a: [5]} must not match {a: {$type: 4}} (4 means array), but it should
    // match {a: {$type: 1}} (1 means number), and {a: [[5]]} must match {$a:
    // {$type: 4}}. Thus, when we see a leaf array, we *should* expand it but
    // should *not* include it itself.
    dontIncludeLeafArrays: true,
    compileElementSelector(operand) {
      if (typeof operand !== 'number')
        throw Error("$type needs a number");
      return value => value !== undefined
        && LocalCollection._f._type(value) === operand;
    }
  },
  $bitsAllSet: {
    compileElementSelector(operand) {
      const op = getOperandBitmask(operand, '$bitsAllSet');
      return value => {
        const bitmask = getValueBitmask(value, op.length);
        return bitmask && op.every((byte, idx) => (bitmask[idx] & byte) == byte);
      };
    }
  },
  $bitsAnySet: {
    compileElementSelector(operand) {
      const query = getOperandBitmask(operand, '$bitsAnySet');
      return value => {
        const bitmask = getValueBitmask(value, query.length);
        return bitmask && query.some((byte, idx) => (~bitmask[idx] & byte) !== byte);
      };
    }
  },
  $bitsAllClear: {
    compileElementSelector(operand) {
      const query = getOperandBitmask(operand, '$bitsAllClear');
      return value => {
        const bitmask = getValueBitmask(value, query.length);
        return bitmask && query.every((byte, idx) => !(bitmask[idx] & byte));
      };
    }
  },
  $bitsAnyClear: {
    compileElementSelector(operand) {
      const query = getOperandBitmask(operand, '$bitsAnyClear');
      return value => {
        const bitmask = getValueBitmask(value, query.length);
        return bitmask && query.some((byte, idx) => (bitmask[idx] & byte) !== byte);
      };
    }
  },
  $regex: {
    compileElementSelector(operand, valueSelector) {
      if (!(typeof operand === 'string' || operand instanceof RegExp))
        throw Error("$regex has to be a string or RegExp");

      let regexp;
      if (valueSelector.$options !== undefined) {
        // Options passed in $options (even the empty string) always overrides
        // options in the RegExp object itself. (See also
        // Mongo.Collection._rewriteSelector.)

        // Be clear that we only support the JS-supported options, not extended
        // ones (eg, Mongo supports x and s). Ideally we would implement x and s
        // by transforming the regexp, but not today...
        if (/[^gim]/.test(valueSelector.$options))
          throw new Error("Only the i, m, and g regexp options are supported");

        const regexSource = operand instanceof RegExp ? operand.source : operand;
        regexp = new RegExp(regexSource, valueSelector.$options);
      } else if (operand instanceof RegExp) {
        regexp = operand;
      } else {
        regexp = new RegExp(operand);
      }
      return regexpElementMatcher(regexp);
    }
  },
  $elemMatch: {
    dontExpandLeafArrays: true,
    compileElementSelector(operand, valueSelector, matcher) {
      if (!LocalCollection._isPlainObject(operand))
        throw Error("$elemMatch need an object");

      let subMatcher, isDocMatcher;
      if (isOperatorObject(Object.keys(operand)
          .filter(key => !Object.keys(LOGICAL_OPERATORS).includes(key))
          .reduce((a, b) => Object.assign(a, {[b]: operand[b]}), {}), true)) {
        subMatcher = compileValueSelector(operand, matcher);
        isDocMatcher = false;
      } else {
        // This is NOT the same as compileValueSelector(operand), and not just
        // because of the slightly different calling convention.
        // {$elemMatch: {x: 3}} means "an element has a field x:3", not
        // "consists only of a field x:3". Also, regexps and sub-$ are allowed.
        subMatcher = compileDocumentSelector(operand, matcher,
                                             {inElemMatch: true});
        isDocMatcher = true;
      }

      return value => {
        if (!Array.isArray(value))
          return false;
        for (let i = 0; i < value.length; ++i) {
          const arrayElement = value[i];
          let arg;
          if (isDocMatcher) {
            // We can only match {$elemMatch: {b: 3}} against objects.
            // (We can also match against arrays, if there's numeric indices,
            // eg {$elemMatch: {'0.b': 3}} or {$elemMatch: {0: 3}}.)
            if (!isIndexable(arrayElement))
              return false;
            arg = arrayElement;
          } else {
            // dontIterate ensures that {a: {$elemMatch: {$gt: 5}}} matches
            // {a: [8]} but not {a: [[8]]}
            arg = [{value: arrayElement, dontIterate: true}];
          }
          // XXX support $near in $elemMatch by propagating $distance?
          if (subMatcher(arg).result)
            return i;   // specially understood to mean "use as arrayIndices"
        }
        return false;
      };
    }
  }
};

// Operators that appear at the top level of a document selector.
const LOGICAL_OPERATORS = {
  $and(subSelector, matcher, inElemMatch) {
    const matchers = compileArrayOfDocumentSelectors(
      subSelector, matcher, inElemMatch);
    return andDocumentMatchers(matchers);
  },

  $or(subSelector, matcher, inElemMatch) {
    const matchers = compileArrayOfDocumentSelectors(
      subSelector, matcher, inElemMatch);

    // Special case: if there is only one matcher, use it directly, *preserving*
    // any arrayIndices it returns.
    if (matchers.length === 1)
      return matchers[0];

    return doc => {
      const result = matchers.some(f => f(doc).result);
      // $or does NOT set arrayIndices when it has multiple
      // sub-expressions. (Tested against MongoDB.)
      return {result};
    };
  },

  $nor(subSelector, matcher, inElemMatch) {
    const matchers = compileArrayOfDocumentSelectors(
      subSelector, matcher, inElemMatch);
    return doc => {
      const result = matchers.every(f => !f(doc).result);
      // Never set arrayIndices, because we only match if nothing in particular
      // 'matched' (and because this is consistent with MongoDB).
      return {result};
    };
  },

  $where(selectorValue, matcher) {
    // Record that *any* path may be used.
    matcher._recordPathUsed('');
    matcher._hasWhere = true;
    if (!(selectorValue instanceof Function)) {
      // XXX MongoDB seems to have more complex logic to decide where or or not
      // to add 'return'; not sure exactly what it is.
      selectorValue = Function('obj', `return ${selectorValue}`);
    }
    return doc => // We make the document available as both `this` and `obj`.
    // XXX not sure what we should do if this throws
    ({
      result: selectorValue.call(doc, doc)
    });
  },

  // This is just used as a comment in the query (in MongoDB, it also ends up in
  // query logs); it has no effect on the actual selection.
  $comment() {
    return () => ({
      result: true
    });
  }
};

// Operators that (unlike LOGICAL_OPERATORS) pertain to individual paths in a
// document, but (unlike ELEMENT_OPERATORS) do not have a simple definition as
// "match each branched value independently and combine with
// convertElementMatcherToBranchedMatcher".
const VALUE_OPERATORS = {
  $eq(operand) {
    return convertElementMatcherToBranchedMatcher(
      equalityElementMatcher(operand));
  },
  $not(operand, valueSelector, matcher) {
    return invertBranchedMatcher(compileValueSelector(operand, matcher));
  },
  $ne(operand) {
    return invertBranchedMatcher(convertElementMatcherToBranchedMatcher(
      equalityElementMatcher(operand)));
  },
  $nin(operand) {
    return invertBranchedMatcher(convertElementMatcherToBranchedMatcher(
      ELEMENT_OPERATORS.$in.compileElementSelector(operand)));
  },
  $exists(operand) {
    const exists = convertElementMatcherToBranchedMatcher(value => value !== undefined);
    return operand ? exists : invertBranchedMatcher(exists);
  },
  // $options just provides options for $regex; its logic is inside $regex
  $options(operand, valueSelector) {
    if (!valueSelector.hasOwnProperty('$regex'))
      throw Error("$options needs a $regex");
    return everythingMatcher;
  },
  // $maxDistance is basically an argument to $near
  $maxDistance(operand, valueSelector) {
    if (!valueSelector.$near)
      throw Error("$maxDistance needs a $near");
    return everythingMatcher;
  },
  $all(operand, valueSelector, matcher) {
    if (!Array.isArray(operand))
      throw Error("$all requires array");
    // Not sure why, but this seems to be what MongoDB does.
    if (operand.length === 0)
      return nothingMatcher;

    const branchedMatchers = [];
    operand.forEach(criterion => {
      // XXX handle $all/$elemMatch combination
      if (isOperatorObject(criterion))
        throw Error("no $ expressions in $all");
      // This is always a regexp or equality selector.
      branchedMatchers.push(compileValueSelector(criterion, matcher));
    });
    // andBranchedMatchers does NOT require all selectors to return true on the
    // SAME branch.
    return andBranchedMatchers(branchedMatchers);
  },
  $near(operand, valueSelector, matcher, isRoot) {
    if (!isRoot)
      throw Error("$near can't be inside another $ operator");
    matcher._hasGeoQuery = true;

    // There are two kinds of geodata in MongoDB: legacy coordinate pairs and
    // GeoJSON. They use different distance metrics, too. GeoJSON queries are
    // marked with a $geometry property, though legacy coordinates can be
    // matched using $geometry.

    let maxDistance, point, distance;
    if (LocalCollection._isPlainObject(operand) && operand.hasOwnProperty('$geometry')) {
      // GeoJSON "2dsphere" mode.
      maxDistance = operand.$maxDistance;
      point = operand.$geometry;
      distance = value => {
        // XXX: for now, we don't calculate the actual distance between, say,
        // polygon and circle. If people care about this use-case it will get
        // a priority.
        if (!value)
          return null;
        if(!value.type)
          return GeoJSON.pointDistance(point,
            { type: "Point", coordinates: pointToArray(value) });
        if (value.type === "Point") {
          return GeoJSON.pointDistance(point, value);
        } else {
          return GeoJSON.geometryWithinRadius(value, point, maxDistance)
            ? 0 : maxDistance + 1;
        }
      };
    } else {
      maxDistance = valueSelector.$maxDistance;
      if (!isIndexable(operand))
        throw Error("$near argument must be coordinate pair or GeoJSON");
      point = pointToArray(operand);
      distance = value => {
        if (!isIndexable(value))
          return null;
        return distanceCoordinatePairs(point, value);
      };
    }

    return branchedValues => {
      // There might be multiple points in the document that match the given
      // field. Only one of them needs to be within $maxDistance, but we need to
      // evaluate all of them and use the nearest one for the implicit sort
      // specifier. (That's why we can't just use ELEMENT_OPERATORS here.)
      //
      // Note: This differs from MongoDB's implementation, where a document will
      // actually show up *multiple times* in the result set, with one entry for
      // each within-$maxDistance branching point.
      branchedValues = expandArraysInBranches(branchedValues);
      const result = {result: false};
      branchedValues.every(branch => {
        // if operation is an update, don't skip branches, just return the first one (#3599)
        let curDistance;
        if (!matcher._isUpdate){
          if (!(typeof branch.value === "object")){
            return true;
          }
          curDistance = distance(branch.value);
          // Skip branches that aren't real points or are too far away.
          if (curDistance === null || curDistance > maxDistance)
            return true;
          // Skip anything that's a tie.
          if (result.distance !== undefined && result.distance <= curDistance)
            return true;
        }
        result.result = true;
        result.distance = curDistance;
        if (!branch.arrayIndices)
          delete result.arrayIndices;
        else
          result.arrayIndices = branch.arrayIndices;
        if (matcher._isUpdate)
          return false;
        return true;
      });
      return result;
    };
  }
};

// NB: We are cheating and using this function to implement 'AND' for both
// 'document matchers' and 'branched matchers'. They both return result objects
// but the argument is different: for the former it's a whole doc, whereas for
// the latter it's an array of 'branched values'.
function andSomeMatchers (subMatchers) {
  if (subMatchers.length === 0)
    return everythingMatcher;
  if (subMatchers.length === 1)
    return subMatchers[0];

  return docOrBranches => {
    const ret = {};
    ret.result = subMatchers.every(f => {
      const subResult = f(docOrBranches);
      // Copy a 'distance' number out of the first sub-matcher that has
      // one. Yes, this means that if there are multiple $near fields in a
      // query, something arbitrary happens; this appears to be consistent with
      // Mongo.
      if (subResult.result && subResult.distance !== undefined
          && ret.distance === undefined) {
        ret.distance = subResult.distance;
      }
      // Similarly, propagate arrayIndices from sub-matchers... but to match
      // MongoDB behavior, this time the *last* sub-matcher with arrayIndices
      // wins.
      if (subResult.result && subResult.arrayIndices) {
        ret.arrayIndices = subResult.arrayIndices;
      }
      return subResult.result;
    });

    // If we didn't actually match, forget any extra metadata we came up with.
    if (!ret.result) {
      delete ret.distance;
      delete ret.arrayIndices;
    }
    return ret;
  };
}

const andDocumentMatchers = andSomeMatchers;
const andBranchedMatchers = andSomeMatchers;

function compileArrayOfDocumentSelectors (selectors, matcher, inElemMatch) {
  if (!Array.isArray(selectors) || selectors.length === 0)
    throw Error('$and/$or/$nor must be nonempty array');
  return selectors.map(subSelector => {
    if (!LocalCollection._isPlainObject(subSelector))
      throw Error('$or/$and/$nor entries need to be full objects');
    return compileDocumentSelector(
      subSelector, matcher, {inElemMatch});
  });
}

// Takes in a selector that could match a full document (eg, the original
// selector). Returns a function mapping document->result object.
//
// matcher is the Matcher object we are compiling.
//
// If this is the root document selector (ie, not wrapped in $and or the like),
// then isRoot is true. (This is used by $near.)
export function compileDocumentSelector (docSelector, matcher, options = {}) {
  let docMatchers = [];
  Object.keys(docSelector).forEach(key => {
    let subSelector = docSelector[key];
    if (key.substr(0, 1) === '$') {
      // Outer operators are either logical operators (they recurse back into
      // this function), or $where.
      if (!LOGICAL_OPERATORS.hasOwnProperty(key))
        throw new Error(`Unrecognized logical operator: ${key}`);
      matcher._isSimple = false;
      docMatchers.push(LOGICAL_OPERATORS[key](subSelector, matcher,
                                              options.inElemMatch));
    } else {
      // Record this path, but only if we aren't in an elemMatcher, since in an
      // elemMatch this is a path inside an object in an array, not in the doc
      // root.
      if (!options.inElemMatch)
        matcher._recordPathUsed(key);
      let lookUpByIndex = makeLookupFunction(key);
      let valueMatcher =
        compileValueSelector(subSelector, matcher, options.isRoot);
      docMatchers.push(doc => {
        let branchValues = lookUpByIndex(doc);
        return valueMatcher(branchValues);
      });
    }
  });

  return andDocumentMatchers(docMatchers);
}

// Takes in a selector that could match a key-indexed value in a document; eg,
// {$gt: 5, $lt: 9}, or a regular expression, or any non-expression object (to
// indicate equality).  Returns a branched matcher: a function mapping
// [branched value]->result object.
function compileValueSelector (valueSelector, matcher, isRoot) {
  if (valueSelector instanceof RegExp) {
    matcher._isSimple = false;
    return convertElementMatcherToBranchedMatcher(
      regexpElementMatcher(valueSelector));
  } else if (isOperatorObject(valueSelector)) {
    return operatorBranchedMatcher(valueSelector, matcher, isRoot);
  } else {
    return convertElementMatcherToBranchedMatcher(
      equalityElementMatcher(valueSelector));
  }
}

// Given an element matcher (which evaluates a single value), returns a branched
// value (which evaluates the element matcher on all the branches and returns a
// more structured return value possibly including arrayIndices).
function convertElementMatcherToBranchedMatcher(elementMatcher, options = {}) {
  return branches => {
    let expanded = branches;
    if (!options.dontExpandLeafArrays) {
      expanded = expandArraysInBranches(
        branches, options.dontIncludeLeafArrays);
    }
    const ret = {};
    ret.result = expanded.some(element => {
      let matched = elementMatcher(element.value);

      // Special case for $elemMatch: it means "true, and use this as an array
      // index if I didn't already have one".
      if (typeof matched === 'number') {
        // XXX This code dates from when we only stored a single array index
        // (for the outermost array). Should we be also including deeper array
        // indices from the $elemMatch match?
        if (!element.arrayIndices)
          element.arrayIndices = [matched];
        matched = true;
      }

      // If some element matched, and it's tagged with array indices, include
      // those indices in our result object.
      if (matched && element.arrayIndices)
        ret.arrayIndices = element.arrayIndices;

      return matched;
    });
    return ret;
  };
}

// Helpers for $near.
function distanceCoordinatePairs (a, b) {
  a = pointToArray(a);
  b = pointToArray(b);
  const x = a[0] - b[0];
  const y = a[1] - b[1];
  if (Number.isNaN(x) || Number.isNaN(y))
    return null;
  return Math.sqrt(x * x + y * y);
}

// Takes something that is not an operator object and returns an element matcher
// for equality with that thing.
export function equalityElementMatcher (elementSelector) {
  if (isOperatorObject(elementSelector))
    throw Error("Can't create equalityValueSelector for operator object");

  // Special-case: null and undefined are equal (if you got undefined in there
  // somewhere, or if you got it due to some branch being non-existent in the
  // weird special case), even though they aren't with EJSON.equals.
  if (elementSelector == null) {  // undefined or null
    return value => // undefined or null
    value == null;
  }

  return value => LocalCollection._f._equal(elementSelector, value);
}

function everythingMatcher (docOrBranchedValues) {
  return {result: true};
}

export function expandArraysInBranches (branches, skipTheArrays) {
  const branchesOut = [];
  branches.forEach(branch => {
    const thisIsArray = Array.isArray(branch.value);
    // We include the branch itself, *UNLESS* we it's an array that we're going
    // to iterate and we're told to skip arrays.  (That's right, we include some
    // arrays even skipTheArrays is true: these are arrays that were found via
    // explicit numerical indices.)
    if (!(skipTheArrays && thisIsArray && !branch.dontIterate)) {
      branchesOut.push({
        value: branch.value,
        arrayIndices: branch.arrayIndices
      });
    }
    if (thisIsArray && !branch.dontIterate) {
      branch.value.forEach((leaf, i) => {
        branchesOut.push({
          value: leaf,
          arrayIndices: (branch.arrayIndices || []).concat(i)
        });
      });
    }
  });
  return branchesOut;
}

// Helpers for $bitsAllSet/$bitsAnySet/$bitsAllClear/$bitsAnyClear.
function getOperandBitmask (operand, selector) {
  // numeric bitmask
  // You can provide a numeric bitmask to be matched against the operand field. It must be representable as a non-negative 32-bit signed integer.
  // Otherwise, $bitsAllSet will return an error.
  if (Number.isInteger(operand) && operand >= 0) {
    return new Uint8Array(new Int32Array([operand]).buffer)
  }
  // bindata bitmask
  // You can also use an arbitrarily large BinData instance as a bitmask.
  else if (EJSON.isBinary(operand)) {
    return new Uint8Array(operand.buffer)
  }
  // position list
  // If querying a list of bit positions, each <position> must be a non-negative integer. Bit positions start at 0 from the least significant bit.
  else if (Array.isArray(operand) && operand.every(e => Number.isInteger(e) && e >= 0)) {
    const buffer = new ArrayBuffer((Math.max(...operand) >> 3) + 1);
    const view = new Uint8Array(buffer);
    operand.forEach(x => {
      view[x >> 3] |= (1 << (x & 0x7))
    })
    return view
  }
  // bad operand
  else {
    throw Error(`operand to ${selector} must be a numeric bitmask (representable as a non-negative 32-bit signed integer), a bindata bitmask or an array with bit positions (non-negative integers)`)
  }
}

function getValueBitmask (value, length) {
  // The field value must be either numerical or a BinData instance. Otherwise, $bits... will not match the current document.
  // numerical
  if (Number.isSafeInteger(value)) {
    // $bits... will not match numerical values that cannot be represented as a signed 64-bit integer
    // This can be the case if a value is either too large or small to fit in a signed 64-bit integer, or if it has a fractional component.
    const buffer = new ArrayBuffer(Math.max(length, 2 * Uint32Array.BYTES_PER_ELEMENT));
    let view = new Uint32Array(buffer, 0, 2);
    view[0] = (value % ((1 << 16) * (1 << 16))) | 0
    view[1] = (value / ((1 << 16) * (1 << 16))) | 0
    // sign extension
    if (value < 0) {
      view = new Uint8Array(buffer, 2)
      view.forEach((byte, idx) => {
        view[idx] = 0xff
      })
    }
    return new Uint8Array(buffer)
  }
  // bindata
  else if (EJSON.isBinary(value)) {
    return new Uint8Array(value.buffer)
  }
  // no match
  return false
}

// Returns a branched matcher that matches iff the given matcher does not.
// Note that this implicitly "deMorganizes" the wrapped function.  ie, it
// means that ALL branch values need to fail to match innerBranchedMatcher.
function invertBranchedMatcher (branchedMatcher) {
  return branchValues => {
    const invertMe = branchedMatcher(branchValues);
    // We explicitly choose to strip arrayIndices here: it doesn't make sense to
    // say "update the array element that does not match something", at least
    // in mongo-land.
    return {result: !invertMe.result};
  };
}

export function isIndexable (obj) {
  return Array.isArray(obj) || LocalCollection._isPlainObject(obj);
}

export function isNumericKey (s) {
  return /^[0-9]+$/.test(s);
}

// Returns true if this is an object with at least one key and all keys begin
// with $.  Unless inconsistentOK is set, throws if some keys begin with $ and
// others don't.
export function isOperatorObject (valueSelector, inconsistentOK) {
  if (!LocalCollection._isPlainObject(valueSelector))
    return false;

  let theseAreOperators = undefined;
  Object.keys(valueSelector).forEach(selKey => {
    const thisIsOperator = selKey.substr(0, 1) === '$';
    if (theseAreOperators === undefined) {
      theseAreOperators = thisIsOperator;
    } else if (theseAreOperators !== thisIsOperator) {
      if (!inconsistentOK)
        throw new Error(`Inconsistent operator: ${JSON.stringify(valueSelector)}`);
      theseAreOperators = false;
    }
  });
  return !!theseAreOperators;  // {} has no operators
}

// Helper for $lt/$gt/$lte/$gte.
function makeInequality (cmpValueComparator) {
  return {
    compileElementSelector(operand) {
      // Arrays never compare false with non-arrays for any inequality.
      // XXX This was behavior we observed in pre-release MongoDB 2.5, but
      //     it seems to have been reverted.
      //     See https://jira.mongodb.org/browse/SERVER-11444
      if (Array.isArray(operand)) {
        return () => false;
      }

      // Special case: consider undefined and null the same (so true with
      // $gte/$lte).
      if (operand === undefined)
        operand = null;

      const operandType = LocalCollection._f._type(operand);

      return value => {
        if (value === undefined)
          value = null;
        // Comparisons are never true among things of different type (except
        // null vs undefined).
        if (LocalCollection._f._type(value) !== operandType)
          return false;
        return cmpValueComparator(LocalCollection._f._cmp(value, operand));
      };
    }
  };
}

// makeLookupFunction(key) returns a lookup function.
//
// A lookup function takes in a document and returns an array of matching
// branches.  If no arrays are found while looking up the key, this array will
// have exactly one branches (possibly 'undefined', if some segment of the key
// was not found).
//
// If arrays are found in the middle, this can have more than one element, since
// we 'branch'. When we 'branch', if there are more key segments to look up,
// then we only pursue branches that are plain objects (not arrays or scalars).
// This means we can actually end up with no branches!
//
// We do *NOT* branch on arrays that are found at the end (ie, at the last
// dotted member of the key). We just return that array; if you want to
// effectively 'branch' over the array's values, post-process the lookup
// function with expandArraysInBranches.
//
// Each branch is an object with keys:
//  - value: the value at the branch
//  - dontIterate: an optional bool; if true, it means that 'value' is an array
//    that expandArraysInBranches should NOT expand. This specifically happens
//    when there is a numeric index in the key, and ensures the
//    perhaps-surprising MongoDB behavior where {'a.0': 5} does NOT
//    match {a: [[5]]}.
//  - arrayIndices: if any array indexing was done during lookup (either due to
//    explicit numeric indices or implicit branching), this will be an array of
//    the array indices used, from outermost to innermost; it is falsey or
//    absent if no array index is used. If an explicit numeric index is used,
//    the index will be followed in arrayIndices by the string 'x'.
//
//    Note: arrayIndices is used for two purposes. First, it is used to
//    implement the '$' modifier feature, which only ever looks at its first
//    element.
//
//    Second, it is used for sort key generation, which needs to be able to tell
//    the difference between different paths. Moreover, it needs to
//    differentiate between explicit and implicit branching, which is why
//    there's the somewhat hacky 'x' entry: this means that explicit and
//    implicit array lookups will have different full arrayIndices paths. (That
//    code only requires that different paths have different arrayIndices; it
//    doesn't actually 'parse' arrayIndices. As an alternative, arrayIndices
//    could contain objects with flags like 'implicit', but I think that only
//    makes the code surrounding them more complex.)
//
//    (By the way, this field ends up getting passed around a lot without
//    cloning, so never mutate any arrayIndices field/var in this package!)
//
//
// At the top level, you may only pass in a plain object or array.
//
// See the test 'minimongo - lookup' for some examples of what lookup functions
// return.
export function makeLookupFunction(key, options = {}) {
  const parts = key.split('.');
  const firstPart = parts.length ? parts[0] : '';
  const firstPartIsNumeric = isNumericKey(firstPart);
  const nextPartIsNumeric = parts.length >= 2 && isNumericKey(parts[1]);
  let lookupRest;
  if (parts.length > 1) {
    lookupRest = makeLookupFunction(parts.slice(1).join('.'));
  }

  const omitUnnecessaryFields = retVal => {
    if (!retVal.dontIterate)
      delete retVal.dontIterate;
    if (retVal.arrayIndices && !retVal.arrayIndices.length)
      delete retVal.arrayIndices;
    return retVal;
  };

  // Doc will always be a plain object or an array.
  // apply an explicit numeric index, an array.
  return (doc, arrayIndices) => {
    if (!arrayIndices)
      arrayIndices = [];

    if (Array.isArray(doc)) {
      // If we're being asked to do an invalid lookup into an array (non-integer
      // or out-of-bounds), return no results (which is different from returning
      // a single undefined result, in that `null` equality checks won't match).
      if (!(firstPartIsNumeric && firstPart < doc.length))
        return [];

      // Remember that we used this array index. Include an 'x' to indicate that
      // the previous index came from being considered as an explicit array
      // index (not branching).
      arrayIndices = arrayIndices.concat(+firstPart, 'x');
    }

    // Do our first lookup.
    const firstLevel = doc[firstPart];

    // If there is no deeper to dig, return what we found.
    //
    // If what we found is an array, most value selectors will choose to treat
    // the elements of the array as matchable values in their own right, but
    // that's done outside of the lookup function. (Exceptions to this are $size
    // and stuff relating to $elemMatch.  eg, {a: {$size: 2}} does not match {a:
    // [[1, 2]]}.)
    //
    // That said, if we just did an *explicit* array lookup (on doc) to find
    // firstLevel, and firstLevel is an array too, we do NOT want value
    // selectors to iterate over it.  eg, {'a.0': 5} does not match {a: [[5]]}.
    // So in that case, we mark the return value as 'don't iterate'.
    if (!lookupRest) {
      return [omitUnnecessaryFields({
        value: firstLevel,
        dontIterate: Array.isArray(doc) && Array.isArray(firstLevel),
        arrayIndices})];
    }

    // We need to dig deeper.  But if we can't, because what we've found is not
    // an array or plain object, we're done. If we just did a numeric index into
    // an array, we return nothing here (this is a change in Mongo 2.5 from
    // Mongo 2.4, where {'a.0.b': null} stopped matching {a: [5]}). Otherwise,
    // return a single `undefined` (which can, for example, match via equality
    // with `null`).
    if (!isIndexable(firstLevel)) {
      if (Array.isArray(doc))
        return [];
      return [omitUnnecessaryFields({value: undefined,
                                      arrayIndices})];
    }

    const result = [];
    const appendToResult = more => {
      Array.prototype.push.apply(result, more);
    };

    // Dig deeper: look up the rest of the parts on whatever we've found.
    // (lookupRest is smart enough to not try to do invalid lookups into
    // firstLevel if it's an array.)
    appendToResult(lookupRest(firstLevel, arrayIndices));

    // If we found an array, then in *addition* to potentially treating the next
    // part as a literal integer lookup, we should also 'branch': try to look up
    // the rest of the parts on each array element in parallel.
    //
    // In this case, we *only* dig deeper into array elements that are plain
    // objects. (Recall that we only got this far if we have further to dig.)
    // This makes sense: we certainly don't dig deeper into non-indexable
    // objects. And it would be weird to dig into an array: it's simpler to have
    // a rule that explicit integer indexes only apply to an outer array, not to
    // an array you find after a branching search.
    //
    // In the special case of a numeric part in a *sort selector* (not a query
    // selector), we skip the branching: we ONLY allow the numeric part to mean
    // 'look up this index' in that case, not 'also look up this index in all
    // the elements of the array'.
    if (Array.isArray(firstLevel) && !(nextPartIsNumeric && options.forSort)) {
      firstLevel.forEach((branch, arrayIndex) => {
        if (LocalCollection._isPlainObject(branch)) {
          appendToResult(lookupRest(
            branch,
            arrayIndices.concat(arrayIndex)));
        }
      });
    }

    return result;
  };
}

// Object exported only for unit testing.
// Use it to export private functions to test in Tinytest.
MinimongoTest = {makeLookupFunction};
MinimongoError = (message, options = {}) => {
  if (typeof message === "string" && options.field) {
    message += ` for field '${options.field}'`;
  }

  const e = new Error(message);
  e.name = "MinimongoError";
  return e;
};

export function nothingMatcher (docOrBranchedValues) {
  return {result: false};
}

// Takes an operator object (an object with $ keys) and returns a branched
// matcher for it.
function operatorBranchedMatcher (valueSelector, matcher, isRoot) {
  // Each valueSelector works separately on the various branches.  So one
  // operator can match one branch and another can match another branch.  This
  // is OK.

  const operatorMatchers = [];
  Object.keys(valueSelector).forEach(operator => {
    const operand = valueSelector[operator];
    const simpleRange = ['$lt', '$lte', '$gt', '$gte'].includes(operator) &&
      typeof operand === 'number';
    const simpleEquality = ['$ne', '$eq'].includes(operator) && operand !== Object(operand);
    const simpleInclusion = ['$in', '$nin'].includes(operator) &&
      Array.isArray(operand) && !operand.some(x => x === Object(x));

    if (! (simpleRange || simpleInclusion || simpleEquality)) {
      matcher._isSimple = false;
    }

    if (VALUE_OPERATORS.hasOwnProperty(operator)) {
      operatorMatchers.push(
        VALUE_OPERATORS[operator](operand, valueSelector, matcher, isRoot));
    } else if (ELEMENT_OPERATORS.hasOwnProperty(operator)) {
      const options = ELEMENT_OPERATORS[operator];
      operatorMatchers.push(
        convertElementMatcherToBranchedMatcher(
          options.compileElementSelector(
            operand, valueSelector, matcher),
          options));
    } else {
      throw new Error(`Unrecognized operator: ${operator}`);
    }
  });

  return andBranchedMatchers(operatorMatchers);
}

// paths - Array: list of mongo style paths
// newLeafFn - Function: of form function(path) should return a scalar value to
//                       put into list created for that path
// conflictFn - Function: of form function(node, path, fullPath) is called
//                        when building a tree path for 'fullPath' node on
//                        'path' was already a leaf with a value. Must return a
//                        conflict resolution.
// initial tree - Optional Object: starting tree.
// @returns - Object: tree represented as a set of nested objects
export function pathsToTree(paths, newLeafFn, conflictFn, tree = {}) {
  paths.forEach(keyPath => {
    let treePos = tree;
    const pathArr = keyPath.split('.');

    // use .every just for iteration with break
    const success = pathArr.slice(0, -1).every((key, idx) => {
      if (!treePos.hasOwnProperty(key))
        treePos[key] = {};
      else if (treePos[key] !== Object(treePos[key])) {
        treePos[key] = conflictFn(treePos[key],
                                  pathArr.slice(0, idx + 1).join('.'),
                                  keyPath);
        // break out of loop if we are failing for this path
        if (treePos[key] !== Object(treePos[key]))
          return false;
      }

      treePos = treePos[key];
      return true;
    });

    if (success) {
      const lastKey = pathArr[pathArr.length - 1];
      if (!treePos.hasOwnProperty(lastKey))
        treePos[lastKey] = newLeafFn(keyPath);
      else
        treePos[lastKey] = conflictFn(treePos[lastKey], keyPath, keyPath);
    }
  });

  return tree;
}

// Makes sure we get 2 elements array and assume the first one to be x and
// the second one to y no matter what user passes.
// In case user passes { lon: x, lat: y } returns [x, y]
function pointToArray (point) {
  return Array.isArray(point) ? point.slice() : [point.x, point.y];
}

// Traverses the keys of passed projection and constructs a tree where all
// leaves are either all True or all False
// @returns Object:
//  - tree - Object - tree representation of keys involved in projection
//  (exception for '_id' as it is a special case handled separately)
//  - including - Boolean - "take only certain fields" type of projection
export function projectionDetails (fields) {
  // Find the non-_id keys (_id is handled specially because it is included unless
  // explicitly excluded). Sort the keys, so that our code to detect overlaps
  // like 'foo' and 'foo.bar' can assume that 'foo' comes first.
  let fieldsKeys = Object.keys(fields).sort();

  // If _id is the only field in the projection, do not remove it, since it is
  // required to determine if this is an exclusion or exclusion. Also keep an
  // inclusive _id, since inclusive _id follows the normal rules about mixing
  // inclusive and exclusive fields. If _id is not the only field in the
  // projection and is exclusive, remove it so it can be handled later by a
  // special case, since exclusive _id is always allowed.
  if (fieldsKeys.length > 0 &&
      !(fieldsKeys.length === 1 && fieldsKeys[0] === '_id') &&
      !(fieldsKeys.includes('_id') && fields['_id']))
    fieldsKeys = fieldsKeys.filter(key => key !== '_id');

  let including = null; // Unknown

  fieldsKeys.forEach(keyPath => {
    const rule = !!fields[keyPath];
    if (including === null)
      including = rule;
    if (including !== rule)
      // This error message is copied from MongoDB shell
      throw MinimongoError("You cannot currently mix including and excluding fields.");
  });


  const projectionRulesTree = pathsToTree(
    fieldsKeys,
    path => including,
    (node, path, fullPath) => {
      // Check passed projection fields' keys: If you have two rules such as
      // 'foo.bar' and 'foo.bar.baz', then the result becomes ambiguous. If
      // that happens, there is a probability you are doing something wrong,
      // framework should notify you about such mistake earlier on cursor
      // compilation step than later during runtime.  Note, that real mongo
      // doesn't do anything about it and the later rule appears in projection
      // project, more priority it takes.
      //
      // Example, assume following in mongo shell:
      // > db.coll.insert({ a: { b: 23, c: 44 } })
      // > db.coll.find({}, { 'a': 1, 'a.b': 1 })
      // { "_id" : ObjectId("520bfe456024608e8ef24af3"), "a" : { "b" : 23 } }
      // > db.coll.find({}, { 'a.b': 1, 'a': 1 })
      // { "_id" : ObjectId("520bfe456024608e8ef24af3"), "a" : { "b" : 23, "c" : 44 } }
      //
      // Note, how second time the return set of keys is different.

      const currentPath = fullPath;
      const anotherPath = path;
      throw MinimongoError(`both ${currentPath} and ${anotherPath} found in fields option, using both of them may trigger unexpected behavior. Did you mean to use only one of them?`);
    });

  return {
    tree: projectionRulesTree,
    including
  };
}

// Takes a RegExp object and returns an element matcher.
export function regexpElementMatcher (regexp) {
  return value => {
    if (value instanceof RegExp) {
      return value.toString() === regexp.toString();
    }
    // Regexps only work against strings.
    if (typeof value !== 'string')
      return false;

    // Reset regexp's state to avoid inconsistent matching for objects with the
    // same value on consecutive calls of regexp.test. This happens only if the
    // regexp has the 'g' flag. Also note that ES6 introduces a new flag 'y' for
    // which we should *not* change the lastIndex but MongoDB doesn't support
    // either of these flags.
    regexp.lastIndex = 0;

    return regexp.test(value);
  };
}
