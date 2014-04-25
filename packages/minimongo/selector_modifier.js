// Returns true if the modifier applied to some document may change the result
// of matching the document by selector
// The modifier is always in a form of Object:
//  - $set
//    - 'a.b.22.z': value
//    - 'foo.bar': 42
//  - $unset
//    - 'abc.d': 1
Minimongo.Matcher.prototype.affectedByModifier = function (modifier) {
  var self = this;
  // safe check for $set/$unset being objects
  modifier = _.extend({ $set: {}, $unset: {} }, modifier);
  var modifiedPaths = _.keys(modifier.$set).concat(_.keys(modifier.$unset));
  var meaningfulPaths = self._getPaths();

  return _.any(modifiedPaths, function (path) {
    var mod = path.split('.');
    return _.any(meaningfulPaths, function (meaningfulPath) {
      var sel = meaningfulPath.split('.');
      var i = 0, j = 0;

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

// Minimongo.Sorter gets a similar method, which delegates to a Matcher it made
// for this exact purpose.
Minimongo.Sorter.prototype.affectedByModifier = function (modifier) {
  var self = this;
  return self._selectorForAffectedByModifier.affectedByModifier(modifier);
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
  var self = this;
  if (!this.affectedByModifier(modifier))
    return false;

  modifier = _.extend({$set:{}, $unset:{}}, modifier);
  var modifierPaths = _.keys(modifier.$set).concat(_.keys(modifier.$unset));

  if (!self.isSimple())
    return true;

  if (_.any(self._getPaths(), pathHasNumericKeys) ||
      _.any(modifierPaths, pathHasNumericKeys))
    return true;

  // check if there is a $set or $unset that indicates something is an
  // object rather than a scalar in the actual object where we saw $-operator
  // NOTE: it is correct since we allow only scalars in $-operators
  // Example: for selector {'a.b': {$gt: 5}} the modifier {'a.b.c':7} would
  // definitely set the result to false as 'a.b' appears to be an object.
  var expectedScalarIsObject = _.any(self._selector, function (sel, path) {
    if (! isOperatorObject(sel))
      return false;
    return _.any(modifierPaths, function (modifierPath) {
      return startsWith(modifierPath, path + '.');
    });
  });

  if (expectedScalarIsObject)
    return false;

  // See if we can apply the modifier on the ideally matching object. If it
  // still matches the selector, then the modifier could have turned the real
  // object in the database into something matching.
  var matchingDocument = EJSON.clone(self.matchingDocument());

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

  return self.documentMatches(matchingDocument).result;
};

// Returns an object that would match the selector if possible or null if the
// selector is too complex for us to analyze
// { 'a.b': { ans: 42 }, 'foo.bar': null, 'foo.baz': "something" }
// => { a: { b: { ans: 42 } }, foo: { bar: null, baz: "something" } }
Minimongo.Matcher.prototype.matchingDocument = function () {
  var self = this;

  // check if it was computed before
  if (self._matchingDocument !== undefined)
    return self._matchingDocument;

  // If the analysis of this selector is too hard for our implementation
  // fallback to "YES"
  var fallback = false;
  self._matchingDocument = pathsToTree(self._getPaths(),
    function (path) {
      var valueSelector = self._selector[path];
      if (isOperatorObject(valueSelector)) {
        // if there is a strict equality, there is a good
        // chance we can use one of those as "matching"
        // dummy value
        if (valueSelector.$in) {
          var matcher = new Minimongo.Matcher({ placeholder: valueSelector });

          // Return anything from $in that matches the whole selector for this
          // path. If nothing matches, returns `undefined` as nothing can make
          // this selector into `true`.
          return _.find(valueSelector.$in, function (x) {
            return matcher.documentMatches({ placeholder: x }).result;
          });
        } else if (onlyContainsKeys(valueSelector, ['$gt', '$gte', '$lt', '$lte'])) {
          var lowerBound = -Infinity, upperBound = Infinity;
          _.each(['$lte', '$lt'], function (op) {
            if (_.has(valueSelector, op) && valueSelector[op] < upperBound)
              upperBound = valueSelector[op];
          });
          _.each(['$gte', '$gt'], function (op) {
            if (_.has(valueSelector, op) && valueSelector[op] > lowerBound)
              lowerBound = valueSelector[op];
          });

          var middle = (lowerBound + upperBound) / 2;
          var matcher = new Minimongo.Matcher({ placeholder: valueSelector });
          if (!matcher.documentMatches({ placeholder: middle }).result &&
              (middle === lowerBound || middle === upperBound))
            fallback = true;

          return middle;
        } else if (onlyContainsKeys(valueSelector, ['$nin',' $ne'])) {
          // Since self._isSimple makes sure $nin and $ne are not combined with
          // objects or arrays, we can confidently return an empty object as it
          // never matches any scalar.
          return {};
        } else {
          fallback = true;
        }
      }
      return self._selector[path];
    },
    _.identity /*conflict resolution is no resolution*/);

  if (fallback)
    self._matchingDocument = null;

  return self._matchingDocument;
};

var getPaths = function (sel) {
  return _.keys(new Minimongo.Matcher(sel)._paths);
  return _.chain(sel).map(function (v, k) {
    // we don't know how to handle $where because it can be anything
    if (k === "$where")
      return ''; // matches everything
    // we branch from $or/$and/$nor operator
    if (_.contains(['$or', '$and', '$nor'], k))
      return _.map(v, getPaths);
    // the value is a literal or some comparison operator
    return k;
  }).flatten().uniq().value();
};

// A helper to ensure object has only certain keys
var onlyContainsKeys = function (obj, keys) {
  return _.all(obj, function (v, k) {
    return _.contains(keys, k);
  });
};

var pathHasNumericKeys = function (path) {
  return _.any(path.split('.'), isNumericKey);
}

// XXX from Underscore.String (http://epeli.github.com/underscore.string/)
var startsWith = function(str, starts) {
  return str.length >= starts.length &&
    str.substring(0, starts.length) === starts;
};

