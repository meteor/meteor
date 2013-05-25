Tinytest.addAsync('timers - defer', function (test, onComplete) {
  var x = 'a';
  Meteor.defer(function () {
    test.equal(x, 'b');
    onComplete();
  });
  x = 'b';
});

Tinytest.addAsync('timers - nested defer', function (test, onComplete) {
  var x = 'a';
  Meteor.defer(function () {
    test.equal(x, 'b');
    Meteor.defer(function () {
      test.equal(x, 'c');
      onComplete();
    });
    x = 'c';
  });
  x = 'b';
});
