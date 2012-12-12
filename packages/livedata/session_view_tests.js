var newView = function(test) {
  var results = [];
  var view = new Meteor._SessionCollectionView('test', {
    added: function (collection, doc) {
      results.push({fun: 'added', doc:doc});
    },
    changed: function (collection, id, changed, cleared) {
      results.push({fun: 'changed', id: id, changed: changed, cleared: cleared});
    },
    removed: function (collection, ids) {
      results.push({fun: 'removed', ids: ids});
    }
  });
  var v = {
    view: view,
    results: results
  };
  _.each(["added", "changed", "removed"], function (it) {
    v[it] = _.bind(view[it], view);
  });
  v.expectResult = function (result) {
    test.equal(results.shift(), result);
  };
  v.expectNoResult = function () {
    test.equal(results, []);
  };
  v.drain = function() {
    var ret = results;
    results = [];
    return ret;
  };
  return v;
};

Tinytest.add('livedata - sessionview - exists reveal', function (test) {
  var v = newView(test);

  v.added("A", {_id: "A1"});
  v.expectResult({fun: 'added', doc: {_id: "A1"}});
  v.expectNoResult();

  v.added("B", {_id: "A1"});
  v.expectNoResult();

  v.removed("A", ["A1"]);
  v.expectNoResult();

  v.removed("B", ["A1"]);
  v.expectResult({fun: 'removed', ids: ["A1"]});
  v.expectNoResult();
});

Tinytest.add('livedata - sessionview - field reveal', function (test) {
  var v = newView(test);

  v.added("A", {_id: "A1", foo: "bar"});
  v.expectResult({fun: 'added', doc: {_id: "A1", foo: "bar"}});
  v.expectNoResult();

  v.added("B", {_id: "A1", foo: "baz"});
  v.removed("A", ["A1"]);
  v.expectResult({fun: 'changed', id: "A1", changed: {foo: "baz"}, cleared: []});
  v.expectNoResult();
  // Somewhere in here we must have changed foo to baz. Legal either on the
  // added or on the removed, but only once.

  v.removed("B", ["A1"]);
  v.expectResult({fun: 'removed', ids: ["A1"]});
  v.expectNoResult();
});

Tinytest.add('livedata - sessionview - field change', function (test) {
  var v = newView(test);

  v.added("A", {_id: "A1", foo: "bar"});
  v.expectResult({fun: 'added', doc: {_id: "A1", foo: "bar"}});
  v.expectNoResult();

  v.changed("A", "A1", {foo: "baz"}, []);
  v.expectResult({fun: 'changed', id: "A1", changed: {foo: "baz"}, cleared: []});
  v.expectNoResult();

  v.removed("A", ["A1"]);
  v.expectResult({fun: 'removed', ids: ["A1"]});
  v.expectNoResult();
});

Tinytest.add('livedata - sessionview - field clear', function (test) {
  var v = newView(test);

  v.added("A", {_id: "A1", foo: "bar"});
  v.expectResult({fun: 'added', doc: {_id: "A1", foo: "bar"}});
  v.expectNoResult();

  v.changed("A", "A1", {}, ["foo"]);
  v.expectResult({fun: 'changed', id: "A1", changed: {}, cleared: ["foo"]});
  v.expectNoResult();

  v.removed("A", ["A1"]);
  v.expectResult({fun: 'removed', ids: ["A1"]});
  v.expectNoResult();
});

Tinytest.add('livedata - sessionview - change makes a new field', function (test) {
  var v = newView(test);

  v.added("A", {_id: "A1", foo: "bar"});
  v.expectResult({fun: 'added', doc: {_id: "A1", foo: "bar"}});
  v.expectNoResult();

  v.changed("A", "A1", {baz:"quux"}, []);
  v.expectResult({fun: 'changed', id: "A1", changed: {baz: "quux"}, cleared: []});
  v.expectNoResult();
});

Tinytest.add('livedata - sessionview - add, remove, add', function (test) {
  var v = newView(test);

  v.added("A", {_id: "A1", foo: "bar"});
  v.expectResult({fun: 'added', doc: {_id: "A1", foo: "bar"}});
  v.expectNoResult();

  v.removed("A", ["A1"]);
  v.expectResult({fun: 'removed', ids: ["A1"]});
  v.expectNoResult();

  v.added("A", {_id: "A1", foo: "bar"});
  v.expectResult({fun: 'added', doc: {_id: "A1", foo: "bar"}});
  v.expectNoResult();

});

Tinytest.add('livedata - sessionview - field clear reveal', function (test) {
  var v = newView(test);

  v.added("A", {_id: "A1", foo: "bar"});
  v.expectResult({fun: 'added', doc: {_id: "A1", foo: "bar"}});
  v.expectNoResult();


  v.added("B", {_id: "A1", foo: "baz"});
  v.changed("A", "A1", {}, ["foo"]);
  v.expectResult({fun: 'changed', id: "A1", changed: {foo: "baz"}, cleared: []});
  v.expectNoResult();

  v.removed("A", ["A1"]);
  v.expectNoResult();
  v.removed("B", ["A1"]);
  v.expectResult({fun: 'removed', ids: ["A1"]});
  v.expectNoResult();
});

Tinytest.add('livedata - sessionview - change to canonical value produces no change', function (test) {
  var v = newView(test);

  v.added("A", {_id: "A1", foo: "bar"});
  v.expectResult({fun: 'added', doc: {_id: "A1", foo: "bar"}});
  v.expectNoResult();


  v.added("B", {_id: "A1", foo: "baz"});
  var canon = "bar";
  var maybeResults = v.drain();
  if (!_.isEmpty(maybeResults)) {
    // if something happened, it was a change message to baz.
    // if nothing did, canon is still bar.
    test.length(maybeResults, 1);
    test.equal(maybeResults[0], {fun: 'added', id: "A1", changed: {foo: "baz"},
                                 cleared: []});
    canon = "baz";
  }
  v.changed("B", "A1", {foo: canon}, []);
  v.expectNoResult();

  v.removed("A", ["A1"]);
  v.expectNoResult();
  v.removed("B", ["A1"]);
  v.expectResult({fun: 'removed', ids: ["A1"]});
  v.expectNoResult();
});

Tinytest.add('livedata - sessionview - new field of canonical value produces no change', function (test) {
  var v = newView(test);

  v.added("A", {_id: "A1", foo: "bar"});
  v.expectResult({fun: 'added', doc: {_id: "A1", foo: "bar"}});
  v.expectNoResult();


  v.added("B", {_id: "A1"});

  v.changed("B", "A1", {foo: "bar"}, []);
  v.expectNoResult();

  v.removed("A", ["A1"]);
  v.expectNoResult();
  v.removed("B", ["A1"]);
  v.expectResult({fun: 'removed', ids: ["A1"]});
  v.expectNoResult();
});

Tinytest.add('livedata - sessionview - clear all clears only once', function (test) {
  var v = newView(test);

  v.added("A", {_id: "A1", foo: "bar"});
  v.expectResult({fun: 'added', doc: {_id: "A1", foo: "bar"}});
  v.expectNoResult();

  v.added("B", {_id: "A1", foo: "bar"});
  v.added("C", {_id: "A1", foo: "bar"});
  v.changed("A", "A1", {}, ["foo"]);
  v.changed("B", "A1", {}, ["foo"]);
  v.changed("C", "A1", {}, ["foo"]);
  v.expectResult({fun: 'changed', id: "A1", changed: {}, cleared: ["foo"]});
  v.expectNoResult();

  v.removed("A", ["A1"]);
  v.expectNoResult();
  v.removed("B", ["A1"]);
  v.expectNoResult();
});

Tinytest.add('livedata - sessionview - change all changes only once', function (test) {
  var v = newView(test);

  v.added("A", {_id: "A1", foo: "bar"});
  v.expectResult({fun: 'added', doc: {_id: "A1", foo: "bar"}});
  v.expectNoResult();

  v.added("B", {_id: "A1", foo: "bar"});
  v.added("C", {_id: "A1", foo: "bar"});
  v.changed("B", "A1", {foo: "baz"}, []);
  v.changed("A", "A1", {foo: "baz"}, []);
  v.changed("C", "A1", {foo: "baz"}, []);
  v.expectResult({fun: 'changed', id: "A1", changed: {foo: "baz"}, cleared: []});
  v.expectNoResult();

  v.removed("A", ["A1"]);
  v.expectNoResult();
  v.removed("B", ["A1"]);
  v.expectNoResult();
});

Tinytest.add('livedata - sessionview - multiple operations at once in a change', function (test) {
  var v = newView(test);

  v.added("A", {_id: "A1", foo: "bar", baz: "quux"});
  v.expectResult({fun: 'added', doc: {_id: "A1", foo: "bar", baz: "quux"}});
  v.expectNoResult();


  v.added("B", {_id: "A1", foo: "baz"});
  v.changed("A", "A1", {thing: "stuff"}, ["foo", "baz"]);
  v.expectResult({fun: 'changed', id: "A1", changed: {foo: "baz", thing: "stuff"}, cleared: ["baz"]});
  v.expectNoResult();

  v.removed("A", ["A1"]);
  v.expectResult({fun: 'changed', id: "A1", changed: {}, cleared: ["thing"]});
  v.expectNoResult();
  v.removed("B", ["A1"]);
  v.expectResult({fun: 'removed', ids: ["A1"]});
  v.expectNoResult();
});

Tinytest.add('livedata - sessionview - more than one document', function (test) {
  var v = newView(test);

  v.added("A", {_id: "A1", foo: "bar", baz: "quux"});
  v.expectResult({fun: 'added', doc: {_id: "A1", foo: "bar", baz: "quux"}});
  v.expectNoResult();


  v.added("A", {_id: "A2", foo: "baz"});
  v.expectResult({fun: 'added', doc: {_id: "A2", foo: "baz"}});
  v.changed("A", "A1", {thing: "stuff"}, ["foo", "baz"]);
  v.expectResult({fun: 'changed', id: "A1", changed: {thing: "stuff"}, cleared: ["foo", "baz"]});
  v.expectNoResult();

  v.removed("A", ["A1"]);
  v.expectResult({fun: 'removed', ids: ["A1"]});
  v.expectNoResult();
  v.removed("A", ["A2"]);
  v.expectResult({fun: 'removed', ids: ["A2"]});
  v.expectNoResult();

});

Tinytest.add('livedata - sessionview - multiple docs removed at once', function (test) {
  var v = newView(test);

  v.added("A", {_id: "A1", foo: "bar", baz: "quux"});
  v.expectResult({fun: 'added', doc: {_id: "A1", foo: "bar", baz: "quux"}});
  v.expectNoResult();


  v.added("A", {_id: "A2", foo: "baz"});
  v.expectResult({fun: 'added', doc: {_id: "A2", foo: "baz"}});
  v.expectNoResult();

  v.removed("A", ["A1", "A2"]);
  v.expectResult({fun: 'removed', ids: ["A1", "A2"]});
  v.expectNoResult();
});


Tinytest.add('livedata - sessionview - complicated sequence', function (test) {
  var v = newView(test);

  v.added("A", {_id: "A1", foo: "bar", baz: "quux"});
  v.expectResult({fun: 'added', doc: {_id: "A1", foo: "bar", baz: "quux"}});
  v.expectNoResult();

  v.added("A", {_id: "A2", foo: "eats"});
  v.expectResult({fun: 'added', doc: {_id: "A2", foo: "eats"}});

  v.added("B", {_id: "A1", foo: "baz"});
  v.changed("A", "A1", {thing: "stuff"}, ["foo", "baz"]);
  v.expectResult({fun: 'changed', id: "A1", changed: {foo: "baz", thing: "stuff"}, cleared: ["baz"]});
  v.expectNoResult();

  v.removed("A", ["A1", "A2"]);
  v.expectResult({fun: 'changed', id: "A1", changed: {}, cleared: ["thing"]});
  v.expectResult({fun: 'removed', ids: ["A2"]});
  v.expectNoResult();
  v.removed("B", ["A1"]);
  v.expectResult({fun: 'removed', ids: ["A1"]});
  v.expectNoResult();
});

Tinytest.add('livedata - sessionview - added becomes changed', function (test) {
  var v = newView(test);

  v.added('A', {_id: 'A1', foo: 'bar'});
  v.expectResult({fun: 'added', doc: {_id: 'A1', foo: 'bar'}});

  v.added('B', {_id: 'A1', hi: 'there'});
  v.expectResult({fun: 'changed', id: 'A1', changed: {hi: 'there'},
                  cleared: []});

  v.removed('A', ['A1']);
  v.expectResult({fun: 'changed', id: 'A1', changed: {}, cleared: ['foo']});

  v.removed('B', ['A1']);
  v.expectResult({fun: 'removed', ids: ['A1']});
});
