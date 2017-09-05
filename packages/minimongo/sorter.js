import {
  ELEMENT_OPERATORS,
  equalityElementMatcher,
  expandArraysInBranches,
  hasOwn,
  isOperatorObject,
  makeLookupFunction,
  regexpElementMatcher,
} from './common.js';

// Give a sort spec, which can be in any of these forms:
//   {"key1": 1, "key2": -1}
//   [["key1", "asc"], ["key2", "desc"]]
//   ["key1", ["key2", "desc"]]
//
// (.. with the first form being dependent on the key enumeration
// behavior of your javascript VM, which usually does what you mean in
// this case if the key names don't look like integers ..)
//
// return a function that takes two objects, and returns -1 if the
// first object comes first in order, 1 if the second object comes
// first, or 0 if neither object comes before the other.

export default class Sorter {
  constructor(spec, options = {}) {
    this._sortSpecParts = [];
    this._sortFunction = null;

    const addSpecPart = (path, ascending) => {
      if (!path) {
        throw Error('sort keys must be non-empty');
      }

      if (path.charAt(0) === '$') {
        throw Error(`unsupported sort key: ${path}`);
      }

      this._sortSpecParts.push({
        ascending,
        lookup: makeLookupFunction(path, {forSort: true}),
        path
      });
    };

    if (spec instanceof Array) {
      spec.forEach(element => {
        if (typeof element === 'string') {
          addSpecPart(element, true);
        } else {
          addSpecPart(element[0], element[1] !== 'desc');
        }
      });
    } else if (typeof spec === 'object') {
      Object.keys(spec).forEach(key => {
        addSpecPart(key, spec[key] >= 0);
      });
    } else if (typeof spec === 'function') {
      this._sortFunction = spec;
    } else {
      throw Error(`Bad sort specification: ${JSON.stringify(spec)}`);
    }

    // If a function is specified for sorting, we skip the rest.
    if (this._sortFunction) {
      return;
    }

    // To implement affectedByModifier, we piggy-back on top of Matcher's
    // affectedByModifier code; we create a selector that is affected by the
    // same modifiers as this sort order. This is only implemented on the
    // server.
    if (this.affectedByModifier) {
      const selector = {};

      this._sortSpecParts.forEach(spec => {
        selector[spec.path] = 1;
      });

      this._selectorForAffectedByModifier = new Minimongo.Matcher(selector);
    }

    this._keyComparator = composeComparators(
      this._sortSpecParts.map((spec, i) => this._keyFieldComparator(i))
    );

    // If you specify a matcher for this Sorter, _keyFilter may be set to a
    // function which selects whether or not a given "sort key" (tuple of values
    // for the different sort spec fields) is compatible with the selector.
    this._keyFilter = null;

    if (options.matcher) {
      this._useWithMatcher(options.matcher);
    }
  }

  getComparator(options) {
    // If sort is specified or have no distances, just use the comparator from
    // the source specification (which defaults to "everything is equal".
    // issue #3599
    // https://docs.mongodb.com/manual/reference/operator/query/near/#sort-operation
    // sort effectively overrides $near
    if (this._sortSpecParts.length || !options || !options.distances) {
      return this._getBaseComparator();
    }

    const distances = options.distances;

    // Return a comparator which compares using $near distances.
    return (a, b) => {
      if (!distances.has(a._id)) {
        throw Error(`Missing distance for ${a._id}`);
      }

      if (!distances.has(b._id)) {
        throw Error(`Missing distance for ${b._id}`);
      }

      return distances.get(a._id) - distances.get(b._id);
    };
  }

  // Takes in two keys: arrays whose lengths match the number of spec
  // parts. Returns negative, 0, or positive based on using the sort spec to
  // compare fields.
  _compareKeys(key1, key2) {
    if (key1.length !== this._sortSpecParts.length ||
        key2.length !== this._sortSpecParts.length) {
      throw Error('Key has wrong length');
    }

    return this._keyComparator(key1, key2);
  }

  // Iterates over each possible "key" from doc (ie, over each branch), calling
  // 'cb' with the key.
  _generateKeysFromDoc(doc, cb) {
    if (this._sortSpecParts.length === 0) {
      throw new Error('can\'t generate keys without a spec');
    }

    const pathFromIndices = indices => `${indices.join(',')},`;

    let knownPaths = null;

    // maps index -> ({'' -> value} or {path -> value})
    const valuesByIndexAndPath = this._sortSpecParts.map(spec => {
      // Expand any leaf arrays that we find, and ignore those arrays
      // themselves.  (We never sort based on an array itself.)
      let branches = expandArraysInBranches(spec.lookup(doc), true);

      // If there are no values for a key (eg, key goes to an empty array),
      // pretend we found one null value.
      if (!branches.length) {
        branches = [{value: null}];
      }

      const element = Object.create(null);
      let usedPaths = false;

      branches.forEach(branch => {
        if (!branch.arrayIndices) {
          // If there are no array indices for a branch, then it must be the
          // only branch, because the only thing that produces multiple branches
          // is the use of arrays.
          if (branches.length > 1) {
            throw Error('multiple branches but no array used?');
          }

          element[''] = branch.value;
          return;
        }

        usedPaths = true;

        const path = pathFromIndices(branch.arrayIndices);

        if (hasOwn.call(element, path)) {
          throw Error(`duplicate path: ${path}`);
        }

        element[path] = branch.value;

        // If two sort fields both go into arrays, they have to go into the
        // exact same arrays and we have to find the same paths.  This is
        // roughly the same condition that makes MongoDB throw this strange
        // error message.  eg, the main thing is that if sort spec is {a: 1,
        // b:1} then a and b cannot both be arrays.
        //
        // (In MongoDB it seems to be OK to have {a: 1, 'a.x.y': 1} where 'a'
        // and 'a.x.y' are both arrays, but we don't allow this for now.
        // #NestedArraySort
        // XXX achieve full compatibility here
        if (knownPaths && !hasOwn.call(knownPaths, path)) {
          throw Error('cannot index parallel arrays');
        }
      });

      if (knownPaths) {
        // Similarly to above, paths must match everywhere, unless this is a
        // non-array field.
        if (!hasOwn.call(element, '') &&
            Object.keys(knownPaths).length !== Object.keys(element).length) {
          throw Error('cannot index parallel arrays!');
        }
      } else if (usedPaths) {
        knownPaths = {};

        Object.keys(element).forEach(path => {
          knownPaths[path] = true;
        });
      }

      return element;
    });

    if (!knownPaths) {
      // Easy case: no use of arrays.
      const soleKey = valuesByIndexAndPath.map(values => {
        if (!hasOwn.call(values, '')) {
          throw Error('no value in sole key case?');
        }

        return values[''];
      });

      cb(soleKey);

      return;
    }

    Object.keys(knownPaths).forEach(path => {
      const key = valuesByIndexAndPath.map(values => {
        if (hasOwn.call(values, '')) {
          return values[''];
        }

        if (!hasOwn.call(values, path)) {
          throw Error('missing path?');
        }

        return values[path];
      });

      cb(key);
    });
  }

  // Returns a comparator that represents the sort specification (but not
  // including a possible geoquery distance tie-breaker).
  _getBaseComparator() {
    if (this._sortFunction) {
      return this._sortFunction;
    }

    // If we're only sorting on geoquery distance and no specs, just say
    // everything is equal.
    if (!this._sortSpecParts.length) {
      return (doc1, doc2) => 0;
    }

    return (doc1, doc2) => {
      const key1 = this._getMinKeyFromDoc(doc1);
      const key2 = this._getMinKeyFromDoc(doc2);
      return this._compareKeys(key1, key2);
    };
  }

  // Finds the minimum key from the doc, according to the sort specs.  (We say
  // "minimum" here but this is with respect to the sort spec, so "descending"
  // sort fields mean we're finding the max for that field.)
  //
  // Note that this is NOT "find the minimum value of the first field, the
  // minimum value of the second field, etc"... it's "choose the
  // lexicographically minimum value of the key vector, allowing only keys which
  // you can find along the same paths".  ie, for a doc {a: [{x: 0, y: 5}, {x:
  // 1, y: 3}]} with sort spec {'a.x': 1, 'a.y': 1}, the only keys are [0,5] and
  // [1,3], and the minimum key is [0,5]; notably, [0,3] is NOT a key.
  _getMinKeyFromDoc(doc) {
    let minKey = null;

    this._generateKeysFromDoc(doc, key => {
      if (!this._keyCompatibleWithSelector(key)) {
        return;
      }

      if (minKey === null) {
        minKey = key;
        return;
      }

      if (this._compareKeys(key, minKey) < 0) {
        minKey = key;
      }
    });

    // This could happen if our key filter somehow filters out all the keys even
    // though somehow the selector matches.
    if (minKey === null) {
      throw Error('sort selector found no keys in doc?');
    }

    return minKey;
  }

  _getPaths() {
    return this._sortSpecParts.map(part => part.path);
  }

  _keyCompatibleWithSelector(key) {
    return !this._keyFilter || this._keyFilter(key);
  }

  // Given an index 'i', returns a comparator that compares two key arrays based
  // on field 'i'.
  _keyFieldComparator(i) {
    const invert = !this._sortSpecParts[i].ascending;

    return (key1, key2) => {
      const compare = LocalCollection._f._cmp(key1[i], key2[i]);
      return invert ? -compare : compare;
    };
  }

  // In MongoDB, if you have documents
  //    {_id: 'x', a: [1, 10]} and
  //    {_id: 'y', a: [5, 15]},
  // then C.find({}, {sort: {a: 1}}) puts x before y (1 comes before 5).
  // But  C.find({a: {$gt: 3}}, {sort: {a: 1}}) puts y before x (1 does not
  // match the selector, and 5 comes before 10).
  //
  // The way this works is pretty subtle!  For example, if the documents
  // are instead {_id: 'x', a: [{x: 1}, {x: 10}]}) and
  //             {_id: 'y', a: [{x: 5}, {x: 15}]}),
  // then C.find({'a.x': {$gt: 3}}, {sort: {'a.x': 1}}) and
  //      C.find({a: {$elemMatch: {x: {$gt: 3}}}}, {sort: {'a.x': 1}})
  // both follow this rule (y before x).  (ie, you do have to apply this
  // through $elemMatch.)
  //
  // So if you pass a matcher to this sorter's constructor, we will attempt to
  // skip sort keys that don't match the selector. The logic here is pretty
  // subtle and undocumented; we've gotten as close as we can figure out based
  // on our understanding of Mongo's behavior.
  _useWithMatcher(matcher) {
    if (this._keyFilter) {
      throw Error('called _useWithMatcher twice?');
    }

    // If we are only sorting by distance, then we're not going to bother to
    // build a key filter.
    // XXX figure out how geoqueries interact with this stuff
    if (!this._sortSpecParts.length) {
      return;
    }

    const selector = matcher._selector;

    // If the user just passed a literal function to find(), then we can't get a
    // key filter from it.
    if (selector instanceof Function) {
      return;
    }

    const constraintsByPath = {};

    this._sortSpecParts.forEach(spec => {
      constraintsByPath[spec.path] = [];
    });

    Object.keys(selector).forEach(key => {
      const subSelector = selector[key];

      // XXX support $and and $or
      const constraints = constraintsByPath[key];
      if (!constraints) {
        return;
      }

      // XXX it looks like the real MongoDB implementation isn't "does the
      // regexp match" but "does the value fall into a range named by the
      // literal prefix of the regexp", ie "foo" in /^foo(bar|baz)+/  But
      // "does the regexp match" is a good approximation.
      if (subSelector instanceof RegExp) {
        // As far as we can tell, using either of the options that both we and
        // MongoDB support ('i' and 'm') disables use of the key filter. This
        // makes sense: MongoDB mostly appears to be calculating ranges of an
        // index to use, which means it only cares about regexps that match
        // one range (with a literal prefix), and both 'i' and 'm' prevent the
        // literal prefix of the regexp from actually meaning one range.
        if (subSelector.ignoreCase || subSelector.multiline) {
          return;
        }

        constraints.push(regexpElementMatcher(subSelector));
        return;
      }

      if (isOperatorObject(subSelector)) {
        Object.keys(subSelector).forEach(operator => {
          const operand = subSelector[operator];

          if (['$lt', '$lte', '$gt', '$gte'].includes(operator)) {
            // XXX this depends on us knowing that these operators don't use any
            // of the arguments to compileElementSelector other than operand.
            constraints.push(
              ELEMENT_OPERATORS[operator].compileElementSelector(operand)
            );
          }

          // See comments in the RegExp block above.
          if (operator === '$regex' && !subSelector.$options) {
            constraints.push(
              ELEMENT_OPERATORS.$regex.compileElementSelector(
                operand,
                subSelector
              )
            );
          }

          // XXX support {$exists: true}, $mod, $type, $in, $elemMatch
        });

        return;
      }

      // OK, it's an equality thing.
      constraints.push(equalityElementMatcher(subSelector));
    });

    // It appears that the first sort field is treated differently from the
    // others; we shouldn't create a key filter unless the first sort field is
    // restricted, though after that point we can restrict the other sort fields
    // or not as we wish.
    if (!constraintsByPath[this._sortSpecParts[0].path].length) {
      return;
    }

    this._keyFilter = key =>
      this._sortSpecParts.every((specPart, index) =>
        constraintsByPath[specPart.path].every(fn => fn(key[index]))
      )
    ;
  }
}

// Given an array of comparators
// (functions (a,b)->(negative or positive or zero)), returns a single
// comparator which uses each comparator in order and returns the first
// non-zero value.
function composeComparators(comparatorArray) {
  return (a, b) => {
    for (let i = 0; i < comparatorArray.length; ++i) {
      const compare = comparatorArray[i](a, b);
      if (compare !== 0) {
        return compare;
      }
    }

    return 0;
  };
}
