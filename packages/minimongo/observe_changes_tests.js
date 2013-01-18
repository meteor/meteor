_.each (['added', 'addedBefore'], function (added) {
  Tinytest.add("observeChanges - single id - basics " + added, function (test) {
    var c = new LocalCollection();
    var logger = new CallbackLogger(test, [added, "changed", "removed"]);
    c.find("foo").observeChanges(logger);
    logger.expectNoResult();
    c.insert({_id: "bar", thing: "stuff"});
    logger.expectNoResult();
    c.insert({_id: "foo", noodles: "good", bacon: "bad", apples: "ok"});
    if (added === 'added')
      logger.expectResult(added, ["foo", {noodles: "good", bacon: "bad", apples: "ok"}]);
    else
      logger.expectResult(added,
                          ["foo", {noodles: "good", bacon: "bad", apples: "ok"}, null]);
    logger.expectNoResult();
    c.update("foo", {noodles: "alright", potatoes: "tasty", apples: "ok"});
    logger.expectResult("changed",
                        ["foo", {noodles: "alright", potatoes: "tasty", bacon: undefined}]);
    logger.expectNoResult();
    c.remove("foo");
    logger.expectResult("removed", ["foo"]);
    logger.expectNoResult();
    c.remove("bar");
    logger.expectNoResult();
    c.insert({_id: "foo", noodles: "good", bacon: "bad", apples: "ok"});
    if (added === 'added')
      logger.expectResult(added, ["foo", {noodles: "good", bacon: "bad", apples: "ok"}]);
    else
      logger.expectResult(added,
                          ["foo", {noodles: "good", bacon: "bad", apples: "ok"}, null]);
    logger.expectNoResult();
  });
});


Tinytest.add("observeChanges - single id - initial adds", function (test) {
  var c = new LocalCollection();
  var logger = new CallbackLogger(test, ["added", "changed", "removed"]);
  c.insert({_id: "foo", noodles: "good", bacon: "bad", apples: "ok"});
  c.find("foo").observeChanges(logger);
  logger.expectResult("added", ["foo", {noodles: "good", bacon: "bad", apples: "ok"}]);
  logger.expectNoResult();
});



Tinytest.add("observeChanges - unordered - initial adds", function (test) {
  var c = new LocalCollection();
  var logger = new CallbackLogger(test, ["added", "changed", "removed"]);
  c.insert({_id: "foo", noodles: "good", bacon: "bad", apples: "ok"});
  c.insert({_id: "bar", noodles: "good", bacon: "weird", apples: "ok"});
  c.find().observeChanges(logger);
  logger.expectResultUnordered([
    {callback: "added",
     args: ["foo", {noodles: "good", bacon: "bad", apples: "ok"}]},
    {callback: "added",
     args: ["bar", {noodles: "good", bacon: "weird", apples: "ok"}]}
  ]);
  logger.expectNoResult();
});

Tinytest.add("observeChanges - unordered - basics", function (test) {
  var c = new LocalCollection();
  var logger = new CallbackLogger(test, ["added", "changed", "removed"]);
  c.find().observeChanges(logger);
  logger.expectNoResult();
  c.insert({_id: "bar", thing: "stuff"});
  logger.expectResult("added", ["bar", {thing: "stuff"}]);
  logger.expectNoResult();

  c.insert({_id: "foo", noodles: "good", bacon: "bad", apples: "ok"});

  logger.expectResult("added", ["foo", {noodles: "good", bacon: "bad", apples: "ok"}]);
  logger.expectNoResult();
  c.update("foo", {noodles: "alright", potatoes: "tasty", apples: "ok"});
  logger.expectResult("changed",
                      ["foo", {noodles: "alright", potatoes: "tasty", bacon: undefined}]);
  logger.expectNoResult();
  c.remove("foo");
  logger.expectResult("removed", ["foo"]);
  logger.expectNoResult();
  c.remove("bar");
  logger.expectResult("removed", ["bar"]);
  logger.expectNoResult();

  c.insert({_id: "foo", noodles: "good", bacon: "bad", apples: "ok"});

  logger.expectResult("added", ["foo", {noodles: "good", bacon: "bad", apples: "ok"}]);
  logger.expectNoResult();
});



Tinytest.add("observeChanges - unordered - enters and exits result set through change", function (test) {
  var c = new LocalCollection();
  var logger = new CallbackLogger(test, ["added", "changed", "removed"]);
  c.find({noodles: "good"}).observeChanges(logger);
  logger.expectNoResult();
  c.insert({_id: "bar", thing: "stuff"});
  logger.expectNoResult();

  c.insert({_id: "foo", noodles: "good", bacon: "bad", apples: "ok"});

  logger.expectResult("added", ["foo", {noodles: "good", bacon: "bad", apples: "ok"}]);
  logger.expectNoResult();
  c.update("foo", {noodles: "alright", potatoes: "tasty", apples: "ok"});
  logger.expectResult("removed",
                      ["foo"]);
  logger.expectNoResult();
  c.remove("foo");
  logger.expectNoResult();
  c.remove("bar");
  logger.expectNoResult();

  c.insert({_id: "foo", noodles: "ok", bacon: "bad", apples: "ok"});
  logger.expectNoResult();
  c.update("foo", {noodles: "good", potatoes: "tasty", apples: "ok"});
  logger.expectResult("added", ["foo", {noodles: "good", potatoes: "tasty", apples: "ok"}]);
  logger.expectNoResult();
});
