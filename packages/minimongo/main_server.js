import './main.js';
import {
  isNumericKey,
  isOperatorObject,
  pathsToTree,
  projectionDetails
} from './common.js';

Minimongo._pathsElidingNumericKeys = function (paths) {
  return paths.map(path => path.split('.').filter(part => !isNumericKey(part)).join('.'));
};

// Returns true if the modifier applied to some document may change the result
// of matching the document by selector
// The modifier is always in a form of Object:
//  - $set
//    - 'a.b.22.z': value
//    - 'foo.bar': 42
//  - $unset
//    - 'abc.d': 1
Minimongo.Matcher.prototype.affectedByModifier = function (modifier) {
  // safe check for $set/$unset being objects
  modifier = Object.assign({ $set: {}, $unset: {} }, modifier);
  const modifiedPaths = Object.keys(modifier.$set).concat(Object.keys(modifier.$unset));
  const meaningfulPaths = this._getPaths();

  return modifiedPaths.some(path => {
    const mod = path.split('.');
    return meaningfulPaths.some(meaningfulPath => {
      const sel = meaningfulPath.split('.');
      let i = 0, j = 0;

      while (i < sel.length && j < mod.length) {
        if (isNumericKey(sel[i]) && isNumericKey(mod[j])) {
          // foo.4.bar selector affected by foo.4 modifier
          // foo.3.bar selector unaffected by foo.4 modifier
          if (sel[i] === mod[j])
            i++, j++;
          else
            return false;
        } else if (isNumericKey(sel[i])) {
          // foo.4.bar selector unaffected by foo.bar modifier
          return false;
        } else if (isNumericKey(mod[j])) {
          j++;
        } else if (sel[i] === mod[j])
          i++, j++;
        else
          return false;
      }

      // One is a prefix of another, taking numeric fields into account
      return true;
    });
  });
};

// @param modifier - Object: MongoDB-styled modifier with `$set`s and `$unsets`
//                           only. (assumed to come from oplog)
// @returns - Boolean: if after applying the modifier, selector can start
//                     accepting the modified value.
// NOTE: assumes that document affected by modifier didn't match this Matcher
// before, so if modifier can't convince selector in a positive change it would
// stay 'false'.
// Currently doesn't support $-operators and numeric indices precisely.
Minimongo.Matcher.prototype.canBecomeTrueByModifier = function (modifier) {
  if (!this.affectedByModifier(modifier))
    return false;

  modifier = Object.assign({$set:{}, $unset:{}}, modifier);
  const modifierPaths = Object.keys(modifier.$set).concat(Object.keys(modifier.$unset));

  if (!this.isSimple())
    return true;

  if (this._getPaths().some(pathHasNumericKeys) ||
      modifierPaths.some(pathHasNumericKeys))
    return true;

  // check if there is a $set or $unset that indicates something is an
  // object rather than a scalar in the actual object where we saw $-operator
  // NOTE: it is correct since we allow only scalars in $-operators
  // Example: for selector {'a.b': {$gt: 5}} the modifier {'a.b.c':7} would
  // definitely set the result to false as 'a.b' appears to be an object.
  const expectedScalarIsObject = Object.keys(this._selector).some(path => {
    const sel = this._selector[path];
    if (! isOperatorObject(sel))
      return false;
    return modifierPaths.some(modifierPath => startsWith(modifierPath, `${path}.`));
  });

  if (expectedScalarIsObject)
    return false;

  // See if we can apply the modifier on the ideally matching object. If it
  // still matches the selector, then the modifier could have turned the real
  // object in the database into something matching.
  const matchingDocument = EJSON.clone(this.matchingDocument());

  // The selector is too complex, anything can happen.
  if (matchingDocument === null)
    return true;

  try {
    LocalCollection._modify(matchingDocument, modifier);
  } catch (e) {
    // Couldn't set a property on a field which is a scalar or null in the
    // selector.
    // Example:
    // real document: { 'a.b': 3 }
    // selector: { 'a': 12 }
    // converted selector (ideal document): { 'a': 12 }
    // modifier: { $set: { 'a.b': 4 } }
    // We don't know what real document was like but from the error raised by
    // $set on a scalar field we can reason that the structure of real document
    // is completely different.
    if (e.name === "MinimongoError" && e.setPropertyError)
      return false;
    throw e;
  }

  return this.documentMatches(matchingDocument).result;
};

// Knows how to combine a mongo selector and a fields projection to a new fields
// projection taking into account active fields from the passed selector.
// @returns Object - projection object (same as fields option of mongo cursor)
Minimongo.Matcher.prototype.combineIntoProjection = function (projection) {
  const selectorPaths = Minimongo._pathsElidingNumericKeys(this._getPaths());

  // Special case for $where operator in the selector - projection should depend
  // on all fields of the document. getSelectorPaths returns a list of paths
  // selector depends on. If one of the paths is '' (empty string) representing
  // the root or the whole document, complete projection should be returned.
  if (selectorPaths.includes(''))
    return {};

  return combineImportantPathsIntoProjection(selectorPaths, projection);
};

// Returns an object that would match the selector if possible or null if the
// selector is too complex for us to analyze
// { 'a.b': { ans: 42 }, 'foo.bar': null, 'foo.baz': "something" }
// => { a: { b: { ans: 42 } }, foo: { bar: null, baz: "something" } }
Minimongo.Matcher.prototype.matchingDocument = function () {
  // check if it was computed before
  if (this._matchingDocument !== undefined)
    return this._matchingDocument;

  // If the analysis of this selector is too hard for our implementation
  // fallback to "YES"
  let fallback = false;
  this._matchingDocument = pathsToTree(this._getPaths(),
    path => {
      const valueSelector = this._selector[path];
      if (isOperatorObject(valueSelector)) {
        // if there is a strict equality, there is a good
        // chance we can use one of those as "matching"
        // dummy value
        if (valueSelector.$eq) {
          return valueSelector.$eq;
        } else if (valueSelector.$in) {
          const matcher = new Minimongo.Matcher({ placeholder: valueSelector });

          // Return anything from $in that matches the whole selector for this
          // path. If nothing matches, returns `undefined` as nothing can make
          // this selector into `true`.
          return valueSelector.$in.find(x => matcher.documentMatches({ placeholder: x }).result);
        } else if (onlyContainsKeys(valueSelector, ['$gt', '$gte', '$lt', '$lte'])) {
          let lowerBound = -Infinity, upperBound = Infinity;
          ['$lte', '$lt'].forEach(op => {
            if (valueSelector.hasOwnProperty(op) && valueSelector[op] < upperBound)
              upperBound = valueSelector[op];
          });
          ['$gte', '$gt'].forEach(op => {
            if (valueSelector.hasOwnProperty(op) && valueSelector[op] > lowerBound)
              lowerBound = valueSelector[op];
          });

          const middle = (lowerBound + upperBound) / 2;
          const matcher = new Minimongo.Matcher({ placeholder: valueSelector });
          if (!matcher.documentMatches({ placeholder: middle }).result &&
              (middle === lowerBound || middle === upperBound))
            fallback = true;

          return middle;
        } else if (onlyContainsKeys(valueSelector, ['$nin', '$ne'])) {
          // Since this._isSimple makes sure $nin and $ne are not combined with
          // objects or arrays, we can confidently return an empty object as it
          // never matches any scalar.
          return {};
        } else {
          fallback = true;
        }
      }
      return this._selector[path];
    },
    x => x);

  if (fallback)
    this._matchingDocument = null;

  return this._matchingDocument;
};

// Minimongo.Sorter gets a similar method, which delegates to a Matcher it made
// for this exact purpose.
Minimongo.Sorter.prototype.affectedByModifier = function (modifier) {
  return this._selectorForAffectedByModifier.affectedByModifier(modifier);
};

Minimongo.Sorter.prototype.combineIntoProjection = function (projection) {
  const specPaths = Minimongo._pathsElidingNumericKeys(this._getPaths());
  return combineImportantPathsIntoProjection(specPaths, projection);
};

function combineImportantPathsIntoProjection (paths, projection) {
  const prjDetails = projectionDetails(projection);
  let tree = prjDetails.tree;
  let mergedProjection = {};

  // merge the paths to include
  tree = pathsToTree(paths,
                     path => true,
                     (node, path, fullPath) => true,
                     tree);
  mergedProjection = treeToPaths(tree);
  if (prjDetails.including) {
    // both selector and projection are pointing on fields to include
    // so we can just return the merged tree
    return mergedProjection;
  } else {
    // selector is pointing at fields to include
    // projection is pointing at fields to exclude
    // make sure we don't exclude important paths
    const mergedExclProjection = {};
    Object.keys(mergedProjection).forEach(path => {
      const incl = mergedProjection[path];
      if (!incl)
        mergedExclProjection[path] = false;
    });

    return mergedExclProjection;
  }
}

function getPaths (sel) {
  return Object.keys(new Minimongo.Matcher(sel)._paths);
  return Object.keys(sel).map(k => {
    const v = sel[k];
    // we don't know how to handle $where because it can be anything
    if (k === "$where")
      return ''; // matches everything
    // we branch from $or/$and/$nor operator
    if (['$or', '$and', '$nor'].includes(k))
      return v.map(getPaths);
    // the value is a literal or some comparison operator
    return k;
  })
  .reduce((a, b) => a.concat(b), [])
  .filter((a, b, c) => c.indexOf(a) === b);
}

// A helper to ensure object has only certain keys
function onlyContainsKeys (obj, keys) {
  return Object.keys(obj).every(k => keys.includes(k));
}

function pathHasNumericKeys (path) {
  return path.split('.').some(isNumericKey);
}

// XXX from Underscore.String (http://epeli.github.com/underscore.string/)
function startsWith(str, starts) {
  return str.length >= starts.length &&
    str.substring(0, starts.length) === starts;
}

// Returns a set of key paths similar to
// { 'foo.bar': 1, 'a.b.c': 1 }
function treeToPaths(tree, prefix = '') {
  const result = {};

  Object.keys(tree).forEach(key => {
    const val = tree[key];
    if (val === Object(val))
      Object.assign(result, treeToPaths(val, `${prefix + key}.`));
    else
      result[prefix + key] = val;
  });

  return result;
}
