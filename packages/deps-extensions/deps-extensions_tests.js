Tinytest.add("add reactive variable basics", function(test) {
  var obj = {};
  
  Meteor.deps.add_reactive_variable(obj, 'foo', 'default');
  
  test.equal(obj.foo(), 'default');
  test.equal(obj.foo.equals('default'), true);
  test.equal(obj.foo.equals('random'), false);
  
  obj.foo.set('random');
  test.equal(obj.foo(), 'random');
  test.equal(obj.foo.equals('default'), false);
  test.equal(obj.foo.equals('random'), true);
});


var test_code_invalidates = function(test, obj, should_be, callback) {
  obj.foo.set('first');
  
  var context = new Meteor.deps.Context();
  var invalidated = false;
  context.on_invalidate(function() { invalidated = true; });
  context.run(callback);
  test.equal(invalidated, false);
  
  obj.foo.set('second');
  Meteor.flush();
  test.equal(invalidated, should_be);
}

Tinytest.add("add reactive variable reactivity", function(test) {
  var obj = {};
  Meteor.deps.add_reactive_variable(obj, 'foo', 'default');
  Meteor.deps.add_reactive_variable(obj, 'bar', 'default');
  
  // this always invalidates when we change foo
  test_code_invalidates(test, obj, true, function() {
    test.equal(obj.foo(), 'first');
  });
  
  // this never invalidates when we change foo
  test_code_invalidates(test, obj, false, function() {
    test.equal(obj.bar(), 'default');
  });
  
  // this should invalidate as we go first -> second
  test_code_invalidates(test, obj, true, function() {
    test.equal(obj.foo.equals('first'), true);
  });
  
  // this should invalidate as we go first -> second
  test_code_invalidates(test, obj, true, function() {
    test.equal(obj.foo.equals('second'), false);
  });
  
  // this should NOT invalidate because we go first -> second (third isn't involved)
  test_code_invalidates(test, obj, false, function() {
    test.equal(obj.foo.equals('third'), false);
  });  
});
