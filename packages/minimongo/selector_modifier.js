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

// @param modifier - Object: MongoDB-styled modifier with `$set`s and `$unsets`
//                           only. (assumed to come from oplog)
// @returns - Boolean: if after applying the modifier, selector can start
//                     accepting the modified value.
// Currently doesn't support $-operators and numeric indices precisely.
Minimongo.Matcher.prototype.canBecomeTrueByModifier = function (modifier) {
  var self = this;
  if (!this.affectedByModifier(modifier))
    return false;

  modifier = _.extend({$set:{}, $unset:{}}, modifier);

  if (!self.isEquality())
    return true;

  if (_.any(self._getPaths(), pathHasNumericKeys) ||
      _.any(_.keys(modifier.$unset), pathHasNumericKeys) ||
      _.any(_.keys(modifier.$set), pathHasNumericKeys))
    return true;

  // convert a selector into an object matching the selector
  // { 'a.b': { ans: 42 }, 'foo.bar': null, 'foo.baz': "something" }
  // => { a: { b: { ans: 42 } }, foo: { bar: null, baz: "something" } }
  var doc = pathsToTree(self._getPaths(),
                        function (path) { return self._selector[path]; },
                        _.identity /*conflict resolution is no resolution*/);

  try {
    LocalCollection._modify(doc, modifier);
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

  return self.documentMatches(doc).result;
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

function pathHasNumericKeys (path) {
  return _.any(path.split('.'), isNumericKey);
}

