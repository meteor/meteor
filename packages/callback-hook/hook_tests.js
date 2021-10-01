Tinytest.add("callback-hook - binds to registrar's env by default", function (test) {
  const hook = new Hook();
  const envVar = new Meteor.EnvironmentVariable;
  envVar.withValue("registrar's value", function() {
    hook.register(function() {
      test.equal(envVar.get(), "registrar's value");
    });
  });
  envVar.withValue("invoker's value", function() {
    hook.forEach(function(callback) {
      callback();
    });
  });
});

Tinytest.add("callback-hook - uses invoker's env with {bindEnvironment: false}", function (test) {
  const hook = new Hook({ bindEnvironment: false });
  const envVar = new Meteor.EnvironmentVariable;
  envVar.withValue("registrar's value", function() {
    hook.register(function() {
      test.equal(envVar.get(), "invoker's value");
    });
  });
  envVar.withValue("invoker's value", function() {
    hook.each(function(callback) {
      callback();
    });
  });
});

Tinytest.add("callback-hook - exceptions unhandled with {bindEnvironment: false}", function (test) {
  const hook = new Hook({ bindEnvironment: false });
  hook.register(function() {
    throw new Error("Test error");
  });
  hook.forEach(function(callback) {
    test.throws(callback, "Test error");
  });
});

Tinytest.add("callback-hook - exceptionHandler used with {bindEnvironment: false}", function (test) {
  const exToThrow = new Error("Test error");
  let thrownEx = null;
  const hook = new Hook({
    bindEnvironment: false,
    exceptionHandler: function (ex) { thrownEx = ex; }
  });
  hook.register(function() {
    throw exToThrow;
  });
  hook.each(function(callback) {
    callback();
  });
  test.equal(exToThrow, thrownEx);
});
