var CurrentFoo = new Meteor.EnvironmentVariable;

Tinytest.add("environment - dynamic variables", function (test) {
  test.equal(CurrentFoo.get(), undefined);

  CurrentFoo.withValue(17, function () {
    test.equal(CurrentFoo.get(), 17);

    CurrentFoo.withValue(22, function () {
      test.equal(CurrentFoo.get(), 22);
    });

    test.equal(CurrentFoo.get(), 17);
  });

  test.equal(CurrentFoo.get(), undefined);
});

Tinytest.add("environment - bindEnvironment", function (test) {
  var raised_f;

  var f = CurrentFoo.withValue(17, function () {
    return Meteor.bindEnvironment(function (flag) {
      test.equal(CurrentFoo.get(), 17);
      if (flag)
        throw "test";
      return 12;
    }, function (e) {
      test.equal(CurrentFoo.get(), 17);
      raised_f = e;
    });
  });

  var test_f = function () {
    raised_f = null;

    test.equal(f(false), 12);
    test.equal(raised_f, null);

    test.equal(f(true), undefined);
    test.equal(raised_f, "test");
  };

  // At top level

  test.equal(CurrentFoo.get(), undefined);
  test_f();

  // Inside a withValue

  CurrentFoo.withValue(22, function () {
    test.equal(CurrentFoo.get(), 22);
    test_f();
    test.equal(CurrentFoo.get(), 22);
  });

  test.equal(CurrentFoo.get(), undefined);

  // Multiple environment-bound functions on the stack (in the nodejs
  // implementation, this needs to avoid creating additional fibers)

  var raised_g;

  var g = CurrentFoo.withValue(99, function () {
    return Meteor.bindEnvironment(function (flag) {
      test.equal(CurrentFoo.get(), 99);

      if (flag)
        throw "trial";

      test_f();
      return 88;
    }, function (e) {
      test.equal(CurrentFoo.get(), 99);
      raised_g = e;
    });
  });

  var test_g = function () {
    raised_g = null;

    test.equal(g(false), 88);
    test.equal(raised_g, null);

    test.equal(g(true), undefined);
    test.equal(raised_g, "trial");
  };

  test_g();

  CurrentFoo.withValue(77, function () {
    test.equal(CurrentFoo.get(), 77);
    test_g();
    test.equal(CurrentFoo.get(), 77);
  });

  test.equal(CurrentFoo.get(), undefined);
});

Tinytest.addAsync("environment - bare bindEnvironment",
                  function (test, onComplete) {
  // this will have to create a fiber in nodejs
  CurrentFoo.withValue(68, function () {
    var f = Meteor.bindEnvironment(function () {
      test.equal(CurrentFoo.get(), 68);
      onComplete();
    }, function () {});

    setTimeout(f, 0);
  });
});
