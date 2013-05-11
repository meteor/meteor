Tinytest.add("constructor - isConstructor", function (test) {
  test.isTrue(Meteor.isConstructor(RegExp));
  test.isFalse(Meteor.isConstructor(123));
});

Tinytest.add("constructor - declareConstructor", function (test) {
  var Foo = function () {
    this.bar = 123;
  };
  var foo = new Foo();
  Meteor.declareConstructor(Foo);
  test.isFalse(Meteor.isConstructor(123));
  test.isFalse(Meteor.isConstructor(foo));
  test.isTrue(Meteor.isConstructor(Foo));
  Meteor.__resetConstructors();
});
