Tinytest.addAsync("timers - defer", function (test, onComplete) {
  let x = "a";
  Meteor.defer(function () {
    test.equal(x, "b");
    onComplete();
  });
  x = "b";
});

Tinytest.addAsync("timers - nested defer", function (test, onComplete) {
  let x = "a";
  Meteor.defer(function () {
    test.equal(x, "b");
    Meteor.defer(function () {
      test.equal(x, "c");
      onComplete();
    });
    x = "c";
  });
  x = "b";
});

Tinytest.addAsync("timers - deferrable", function (test, onComplete) {
  let x = "a";
  Meteor.deferrable(
    function () {
      test.equal(x, "b");
      onComplete();
    },
    { on: ["development", "production", "test"] }
  );
  x = "b";
});

Tinytest.addAsync(
  "timers - deferrable not in current env",
  function (test, onComplete) {
    let x = "a";
    Meteor.deferrable(
      function () {
        x = "b";
      },
      { on: [] }
    );
    test.equal(x, "b");
    onComplete();
  }
);

Tinytest.addAsync(
  "timers - deferrable works with async functions",
  function (test, onComplete) {
    let x = Meteor.deferrable(
      function () {
        return "start value";
      },
      { on: [] }
    );
    test.equal(x, "start value");

    Meteor.deferrable(
      function () {
        test.equal(x, "value");
        onComplete();
      },
      { on: ["development", "production", "test"] }
    );

    Meteor.deferrable(
      async function () {
        return "value";
      },
      { on: [] }
    ).then((value) => (x = value));
    
  }
);

if (Meteor.isServer) {
  [
    ["setTimeout", (f) => Meteor.setTimeout(f, 0)],
    ["setInterval", (f) => Meteor.setInterval(f, 0)],
    ["defer", (f) => Meteor.defer(f)],
  ].forEach(([name, schedule]) => {
    Tinytest.addAsync(
      `timers - ${name} logs errors thrown by async callbacks`,
      async function (test) {
        const originalDebug = Meteor._debug;
        let handle;
        try {
          const logged = await new Promise((resolve) => {
            Meteor._debug = (...args) => resolve(args);
            handle = schedule(async () => {
              throw new Error("async boom");
            });
          });
          test.equal(logged[0], `Exception in ${name} callback:`);
          test.equal(logged[1].message, "async boom");
        } finally {
          Meteor._debug = originalDebug;
          if (name === "setInterval") Meteor.clearInterval(handle);
        }
      }
    );
  });
}
