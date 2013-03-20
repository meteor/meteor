var makeCollection = function () {
  if (Meteor.isServer)
    return new Meteor.Collection(Random.id());
  else
    return new Meteor.Collection(null);
};

_.each ([{added:'added', forceOrdered: true},
         {added:'added', forceOrdered: false},
         {added: 'addedBefore', forceOrdered: false}], function (options) {
           var added = options.added;
           var forceOrdered = options.forceOrdered;
  Tinytest.addAsync("observeChanges - single id - basics "
                    + added
                    + (forceOrdered ? " force ordered" : ""),
                    function (test, onComplete) {
    var c = makeCollection();
    var counter = 0;
    var callbacks = [added, "changed", "removed"];
    if (forceOrdered)
      callbacks.push("movedBefore");
    withCallbackLogger(test,
                       [added, "changed", "removed"],
                       Meteor.isServer,
                       function (logger) {
    var barid = c.insert({thing: "stuff"});
    var fooid = c.insert({noodles: "good", bacon: "bad", apples: "ok"});
    var handle = c.find(fooid).observeChanges(logger);
    if (added === 'added')
      logger.expectResult(added, [fooid, {noodles: "good", bacon: "bad",apples: "ok"}]);
    else
      logger.expectResult(added,
                          [fooid, {noodles: "good", bacon: "bad", apples: "ok"}, null]);
    c.update(fooid, {noodles: "alright", potatoes: "tasty", apples: "ok"});
    logger.expectResult("changed",
                        [fooid, {noodles: "alright", potatoes: "tasty", bacon: undefined}]);

    c.remove(fooid);
    logger.expectResult("removed", [fooid]);

    c.remove(barid);

    c.insert({noodles: "good", bacon: "bad", apples: "ok"});
    logger.expectNoResult();
    handle.stop();
    onComplete();
    });
  });
});


Tinytest.addAsync("observeChanges - single id - initial adds", function (test, onComplete) {
  var c = makeCollection();
  withCallbackLogger(test, ["added", "changed", "removed"], Meteor.isServer, function (logger) {
  var fooid = c.insert({noodles: "good", bacon: "bad", apples: "ok"});
  var handle = c.find(fooid).observeChanges(logger);
  logger.expectResult("added", [fooid, {noodles: "good", bacon: "bad", apples: "ok"}]);
  logger.expectNoResult();
  handle.stop();
  onComplete();
  });
});



Tinytest.addAsync("observeChanges - unordered - initial adds", function (test, onComplete) {
  var c = makeCollection();
  withCallbackLogger(test, ["added", "changed", "removed"], Meteor.isServer, function (logger) {
  var fooid = c.insert({noodles: "good", bacon: "bad", apples: "ok"});
  var barid = c.insert({noodles: "good", bacon: "weird", apples: "ok"});
  var handle = c.find().observeChanges(logger);
  logger.expectResultUnordered([
    {callback: "added",
     args: [fooid, {noodles: "good", bacon: "bad", apples: "ok"}]},
    {callback: "added",
     args: [barid, {noodles: "good", bacon: "weird", apples: "ok"}]}
  ]);
  logger.expectNoResult();
  handle.stop();
  onComplete();
  });
});

Tinytest.addAsync("observeChanges - unordered - basics", function (test, onComplete) {
  var c = makeCollection();
  withCallbackLogger(test, ["added", "changed", "removed"], Meteor.isServer, function (logger) {
  var handle = c.find().observeChanges(logger);
  var barid = c.insert({thing: "stuff"});
  logger.expectResultOnly("added", [barid, {thing: "stuff"}]);

  var fooid = c.insert({noodles: "good", bacon: "bad", apples: "ok"});

  logger.expectResultOnly("added", [fooid, {noodles: "good", bacon: "bad", apples: "ok"}]);

  c.update(fooid, {noodles: "alright", potatoes: "tasty", apples: "ok"});
  c.update(fooid, {noodles: "alright", potatoes: "tasty", apples: "ok"});
  logger.expectResultOnly("changed",
                      [fooid, {noodles: "alright", potatoes: "tasty", bacon: undefined}]);
  c.remove(fooid);
  logger.expectResultOnly("removed", [fooid]);
  c.remove(barid);
  logger.expectResultOnly("removed", [barid]);

  fooid = c.insert({noodles: "good", bacon: "bad", apples: "ok"});

  logger.expectResult("added", [fooid, {noodles: "good", bacon: "bad", apples: "ok"}]);
  logger.expectNoResult();
  handle.stop();
  onComplete();
  });
});

if (Meteor.isServer) {
  Tinytest.addAsync("observeChanges - unordered - specific fields", function (test, onComplete) {
    var c = makeCollection();
    withCallbackLogger(test, ["added", "changed", "removed"], Meteor.isServer, function (logger) {
      var handle = c.find({}, {fields:{noodles: 1, bacon: 1}}).observeChanges(logger);
      var barid = c.insert({thing: "stuff"});
      logger.expectResultOnly("added", [barid, {}]);

      var fooid = c.insert({noodles: "good", bacon: "bad", apples: "ok"});

      logger.expectResultOnly("added", [fooid, {noodles: "good", bacon: "bad"}]);

      c.update(fooid, {noodles: "alright", potatoes: "tasty", apples: "ok"});
      logger.expectResultOnly("changed",
                              [fooid, {noodles: "alright", bacon: undefined}]);
      c.update(fooid, {noodles: "alright", potatoes: "meh", apples: "ok"});
      c.remove(fooid);
      logger.expectResultOnly("removed", [fooid]);
      c.remove(barid);
      logger.expectResultOnly("removed", [barid]);

      fooid = c.insert({noodles: "good", bacon: "bad"});

      logger.expectResult("added", [fooid, {noodles: "good", bacon: "bad"}]);
      logger.expectNoResult();
      handle.stop();
      onComplete();
    });
  });
}


Tinytest.addAsync("observeChanges - unordered - enters and exits result set through change", function (test, onComplete) {
  var c = makeCollection();
  withCallbackLogger(test, ["added", "changed", "removed"], Meteor.isServer, function (logger) {
  var handle = c.find({noodles: "good"}).observeChanges(logger);
  var barid = c.insert({thing: "stuff"});

  var fooid = c.insert({noodles: "good", bacon: "bad", apples: "ok"});
  logger.expectResultOnly("added", [fooid, {noodles: "good", bacon: "bad", apples: "ok"}]);

  c.update(fooid, {noodles: "alright", potatoes: "tasty", apples: "ok"});
  logger.expectResultOnly("removed",
                      [fooid]);
  c.remove(fooid);
  c.remove(barid);

  fooid = c.insert({noodles: "ok", bacon: "bad", apples: "ok"});
  c.update(fooid, {noodles: "good", potatoes: "tasty", apples: "ok"});
  logger.expectResult("added", [fooid, {noodles: "good", potatoes: "tasty", apples: "ok"}]);
  logger.expectNoResult();
  handle.stop();
  onComplete();
  });
});
