Tinytest.add("session get/equals reactiveness", function(test) {
  var context_called = 0;
  
  var setup = function(cb) {
    var context = new Meteor.deps.Context();
    context.on_invalidate(function() { setup(cb); });
    context.run(function() {
      context_called += 1;
      cb();
    });
  };
  
  var should_get = 'bar', should_equal_bar = true;
  Session.set('foo', 'bar');
  setup(function() {
    test.equal(Session.get('foo'), should_get);;
  });
  setup(function() {
    test.equal(Session.equals('foo', 'bar'), should_equal_bar);
  });
  Meteor.flush();
  test.equal(context_called, 2);
  
  should_get = 'baz', should_equal_bar = false;
  Session.set('foo', 'baz');
  Meteor.flush();
  test.equal(context_called, 4);
});

// don't really know how to run this test
// Tinytest.add("session state stored", function(test) {
//   Session.set('permanent', 'value');
//   test.isTrue(Session.equals('permanent', 'value'));
// });