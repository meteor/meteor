LocalCollection._compileProjection = function (fields) {
  if (!_.isObject(fields))
    throw MinimongoError("fields option must be an object");

  if (_.any(_.values(fields), function (x) {
      return _.indexOf([1, 0, true, false], x) === -1; }))
    throw MinimongoError("Projection values should be one of 1, 0, true, or false");

  var _idProjection = _.isUndefined(fields._id) ? true : fields._id;
  // Find the non-_id keys (_id is handled specially because it is included unless
  // explicitly excluded). Sort the keys, so that our code to detect overlaps
  // like 'foo' and 'foo.bar' can assume that 'foo' comes first.
  var fieldsKeys = _.reject(_.keys(fields).sort(), function (key) { return key === '_id'; });
  var including = null; // Unknown
  var projectionRulesTree = {}; // Tree represented as nested objects

  _.each(fieldsKeys, function (keyPath) {
    var rule = !!fields[keyPath];
    if (including === null)
      including = rule;
    if (including !== rule)
      // This error message is copies from MongoDB shell
      throw MinimongoError("You cannot currently mix including and excluding fields.");
    var treePos = projectionRulesTree;
    keyPath = keyPath.split('.');

    _.each(keyPath.slice(0, -1), function (key, idx) {
      if (!_.has(treePos, key))
        treePos[key] = {};
      else if (_.isBoolean(treePos[key])) {
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

        var currentPath = keyPath.join('.');
        var anotherPath = keyPath.slice(0, idx + 1).join('.');
        throw MinimongoError("both " + currentPath + " and " + anotherPath +
         " found in fields option, using both of them may trigger " +
         "unexpected behavior. Did you mean to use only one of them?");
      }

      treePos = treePos[key];
    });

    treePos[_.last(keyPath)] = including;
  });

  // returns transformed doc according to ruleTree
  var transform = function (doc, ruleTree) {
    // Special case for "sets"
    if (_.isArray(doc))
      return _.map(doc, function (subdoc) { return transform(subdoc, ruleTree); });

    var res = including ? {} : EJSON.clone(doc);
    _.each(ruleTree, function (rule, key) {
      if (!_.has(doc, key))
        return;
      if (_.isObject(rule)) {
        // For sub-objects/subsets we branch
        if (_.isObject(doc[key]))
          res[key] = transform(doc[key], rule);
        // Otherwise we don't even touch this subfield
      } else if (including)
        res[key] = doc[key];
      else
        delete res[key];
    });

    return res;
  };

  return function (obj) {
    var res = transform(obj, projectionRulesTree);

    if (_idProjection && _.has(obj, '_id'))
      res._id = obj._id;
    if (!_idProjection && _.has(res, '_id'))
      delete res._id;
    return res;
  };
};
