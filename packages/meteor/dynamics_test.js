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

if (Meteor.isServer) {
  Tinytest.addAsync(
    "environment - dynamic variables with two context (server)",
    async function (test) {
      // Ensure "0" as the dynamic context spread properly
      // https://github.com/meteor/meteor/pull/13089
      const context0 = new Meteor.EnvironmentVariable();
      context0.slot = 0;

      const context1 = new Meteor.EnvironmentVariable();
      const context2 = new Meteor.EnvironmentVariable();

      return context0.withValue(0, async () => {
        test.equal(context1.get(), undefined);
        await context1.withValue(42, async () => {
          test.equal(context2.get(), undefined);
          await context2.withValue(1, async () => {
            await context2.withValue(2, async () => {
              test.equal(context2.get(), 2);
              test.equal(context0.get(), 0);
            });
            test.equal(context1.get(), 42);
            test.equal(context2.get(), 1);
            test.equal(context0.get(), 0);
          });
          test.equal(context1.get(), 42);
          test.equal(context2.get(), undefined);
          test.equal(context0.get(), 0);
        });
        test.equal(context0.get(), 0);
      });
    }
  );
} else {
  // Basically the same test as the server one, but without async/await
  // as we don't handle async on the client in this case
  // due to the idea that we need to keep new EcmaScript features doesn't compile in older browsers
  Tinytest.add(
    "environment - dynamic variables with two context (client)",
    function (test) {
      // Ensure "0" as the dynamic context spread properly
      // https://github.com/meteor/meteor/pull/13089
      const context0 = new Meteor.EnvironmentVariable();
      context0.slot = 0;

      const context1 = new Meteor.EnvironmentVariable();
      const context2 = new Meteor.EnvironmentVariable();
      context0.withValue(0, async () => {
        test.equal(context1.get(), undefined);
        context1.withValue(42, () => {
          test.equal(context2.get(), undefined);
          context2.withValue(1, () => {
            context2.withValue(2, () => {
              test.equal(context2.get(), 2);
              test.equal(context0.get(), 0);
            });
            test.equal(context1.get(), 42);
            test.equal(context2.get(), 1);
            test.equal(context0.get(), 0);
          });
          test.equal(context1.get(), 42);
          test.equal(context2.get(), undefined);
          test.equal(context0.get(), 0);
        });
        test.equal(context0.get(), 0);
      });
    }
  );
}
Tinytest.addAsync("environment - bindEnvironment", async function (test) {
  var raised_f;

  var f = await CurrentFoo.withValue(17, function () {
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

  var test_f = async function () {
    raised_f = null;

    test.equal(await f(false), 12);
    test.equal(raised_f, null);

    test.equal(await f(true), undefined);
    test.equal(raised_f, "test");
  };

  // At top level

  test.equal(CurrentFoo.get(), undefined);
  await test_f();

  // Inside a withValue

  await CurrentFoo.withValue(22, function () {
    test.equal(CurrentFoo.get(), 22);
    test_f();
    test.equal(CurrentFoo.get(), 22);
  });

  test.equal(CurrentFoo.get(), undefined);

  // Multiple environment-bound functions on the stack (in the nodejs
  // implementation, this needs to avoid creating additional fibers)

  var raised_g;

  var g = await CurrentFoo.withValue(99, function () {
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

  var test_g = async function () {
    raised_g = null;

    test.equal(await g(false), 88);
    test.equal(raised_g, null);

    test.equal(await g(true), undefined);
    test.equal(raised_g, "trial");
  };

  await test_g();

  await CurrentFoo.withValue(77, function () {
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

if (Meteor.isServer) {
  Tinytest.addAsync('environment - preserve ev value', function (test, onComplete) {
    let val1 = null;
    let val2 = null;

    let ev1 = new Meteor.EnvironmentVariable();

    async function runAsyncFunction() {
      await new Promise(resolve => setTimeout(resolve, 10));
      val2 = ev1.get();

      test.equal(val1, { name: 'test' });
      test.equal(val2, { name: 'test' });
      onComplete();
    }

    ev1.withValue({ name: 'test' }, () => {
      runAsyncFunction();
      val1 = ev1.get();
    });
  })
}