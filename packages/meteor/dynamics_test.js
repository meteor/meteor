CurrentFoo = new Meteor.DynamicVariable;

test("environment - dynamic variables", function () {
  assert.equal(CurrentFoo.get(), undefined);

  CurrentFoo.withValue(17, function () {
    assert.equal(CurrentFoo.get(), 17);

    CurrentFoo.withValue(22, function () {
      assert.equal(CurrentFoo.get(), 22);
    });

    assert.equal(CurrentFoo.get(), 17);
  });

  assert.equal(CurrentFoo.get(), undefined);
});

test("environment - bindEnvironment", function () {
  var raised_f;

  var f = CurrentFoo.withValue(17, function () {
    return Meteor.bindEnvironment(function (flag) {
      assert.equal(CurrentFoo.get(), 17);
      if (flag)
        throw "test";
      return 12;
    }, function (e) {
      assert.equal(CurrentFoo.get(), 17);
      raised_f = e;
    });
  });

  var test_f = function () {
    raised_f = null;

    assert.equal(f(false), 12);
    assert.equal(raised_f, null);

    assert.equal(f(true), undefined);
    assert.equal(raised_f, "test");
  };

  // At top level

  assert.equal(CurrentFoo.get(), undefined);
  test_f();

  // Inside a withValue

  CurrentFoo.withValue(22, function () {
    assert.equal(CurrentFoo.get(), 22);
    test_f();
    assert.equal(CurrentFoo.get(), 22);
  });

  assert.equal(CurrentFoo.get(), undefined);

  // Multiple environment-bound functions on the stack (in the nodejs
  // implementation, this needs to avoid creating additional fibers)

  var raised_g;

  var g = CurrentFoo.withValue(99, function () {
    return Meteor.bindEnvironment(function (flag) {
      assert.equal(CurrentFoo.get(), 99);

      if (flag)
        throw "trial";

      test_f();
      return 88;
    }, function (e) {
      assert.equal(CurrentFoo.get(), 99);
      raised_g = e;
    });
  });

  var test_g = function () {
    raised_g = null;

    assert.equal(g(false), 88);
    assert.equal(raised_g, null);

    assert.equal(g(true), undefined);
    assert.equal(raised_g, "trial");
  };

  test_g();

  CurrentFoo.withValue(77, function () {
    assert.equal(CurrentFoo.get(), 77);
    test_g();
    assert.equal(CurrentFoo.get(), 77);
  });

  assert.equal(CurrentFoo.get(), undefined);
});

testAsync("environment - bare bindEnvironment", function (onComplete) {
  // this will have to create a fiber in nodejs
  CurrentFoo.withValue(68, function () {
    var f = Meteor.bindEnvironment(function () {
      assert.equal(CurrentFoo.get(), 68);
      onComplete();
    });

    setTimeout(f, 0);
  });
});
