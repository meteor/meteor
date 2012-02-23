test("environment - basics", function () {
  assert.isTrue(Meteor.is_client);
  assert.isFalse(Meteor.is_server);
});

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
  var raised;

  var f;
  CurrentFoo.withValue(17, function () {
    f = Meteor.bindEnvironment(function (flag) {
      assert.equal(CurrentFoo.get(), 17);
      if (flag)
        throw "test";
      return 12;
    }, function (e) {
      raised = e;
    });
  });

  assert.equal(CurrentFoo.get(), undefined);

  assert.equal(f(false), 12);
  assert.equal(raised, undefined);

  assert.equal(f(true), undefined);
  assert.equal(raised, "test");

  raised = undefined;
  CurrentFoo.withValue(22, function () {
    assert.equal(CurrentFoo.get(), 22);

    assert.equal(f(false), 12);
    assert.equal(raised, undefined);

    assert.equal(f(true), undefined);
    assert.equal(raised, "test");
  });

  assert.equal(CurrentFoo.get(), undefined);
});