Tinytest.add("session basic get/set/equals", function(test) {
  // can't do these tests due to reloading
  // test.equal(Session.get('foo'), undefined);
  // test.equal(Session.equals('foo', 'bar'), false);
  
  Session.set('foo', 'bar');
  test.equal(Session.get('foo'), 'bar');
  test.equal(Session.equals('foo', 'bar'), true);
  test.equal(Session.equals('foo', 'diff'), false);
  
  Session.set('foo', 'diff');
  test.equal(Session.get('foo'), 'diff');
  test.equal(Session.equals('foo', 'bar'), false);
  test.equal(Session.equals('foo', 'diff'), true);
});
