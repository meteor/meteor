Tinytest.add("reload - migrate", function (test) {
  Reload._withFreshProvidersForTest(function () {
    var ready = false;

    Reload._onMigrate("reload test data 1", function (tryReload, options) {
      return [ready, { foo: "bar" }];
    });

    Reload._onMigrate("reload test data 2", function (tryReload, options) {
      return [true, { baz: "bar" }];
    });

    // When one provider returns false, no migration data should be stored.
    test.isFalse(Reload._migrate(function () { }));
    test.isFalse(Reload._getData());

    // If an immediate migration is happening, then it shouldn't matter if
    // one provider returns false.
    test.isTrue(Reload._migrate(function () { }, { immediateMigration: true }));
    var data = JSON.parse(Reload._getData());
    test.equal(data.data["reload test data 1"], { foo: "bar" });
    test.equal(data.data["reload test data 2"], { baz: "bar" });
    test.equal(data.reload, true);

    // Now all providers are ready.
    ready = true;
    test.isTrue(Reload._migrate(function () { }));

    data = JSON.parse(Reload._getData());
    test.equal(data.data["reload test data 1"], { foo: "bar" });
    test.equal(data.data["reload test data 2"], { baz: "bar" });
    test.equal(data.reload, true);
  });
});
