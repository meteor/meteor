Tinytest.add("underscore-tests - each", function (test) {
  // arrays
  _.each([42], function (val, index) {
    test.equal(index, 0);
    test.equal(val, 42);
  });

  // objects with 'length' field aren't treated as arrays
  _.each({length: 42}, function (val, key) {
    test.equal(key, 'length');
    test.equal(val, 42);
  });

  // The special 'arguments' variable is treated as an
  // array
  (function () {
    _.each(arguments, function (val, index) {
      test.equal(index, 0);
      test.equal(val, 42);
    });
  })(42);

  // An object with a 'callee' field isn't treated as arguments
  _.each({callee: 42}, function (val, key) {
    test.equal(key, 'callee');
    test.equal(val, 42);
  });

  // An object with a 'callee' field isn't treated as arguments
  _.each({length: 4, callee: 42}, function (val, key) {
    if (key === 'callee')
      test.equal(val, 42);
    else if (key === 'length')
      test.equal(val, 4);
    else
      test.fail({message: 'unexpected key: ' + key});
  });


  // NOTE: An object with a numberic 'length' field *and* a function
  // 'callee' field will be treated as an array in IE. This may or may
  // not be fixable, but isn't a big deal since: (1) 'callee' is a
  // pretty rare key, and (2) JSON objects can't have functions
  // anyways, which is the main use-case for _.each.
});
