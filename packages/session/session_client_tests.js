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

// XXX : can't override native window.location.reload
//  need to find another way to test this.
//
// // XXX: don't really know how to run this test, this feels a bit hacky, 
// //   but at least tests something
// Tinytest.add("session state stored", function(test) {
//   Session.set('permanent', 'value');
//   test.isTrue(Session.equals('permanent', 'value'));
//   
//   var old_reload = window.location.reload;
//   window.location.reload = function() {
//     // clear the Session out
//     for (var key in Session.keys) {
//       Session.set(key, undefined);
//     }
//   };
//   // Meteor._reload.reload();
//   window.location.reload = old_reload;
//   
//   test.isTrue(Session.equals('permanent', 'value'));
// });