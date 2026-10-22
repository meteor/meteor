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
