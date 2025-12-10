import isEmpty from 'lodash.isempty';

var newView = function(test) {
  var results = [];
  var view = new DDPServer._SessionCollectionView('test', {
    added: function (collection, id, fields) {
      results.push({fun: 'added', id: id, fields: fields});
    },
    changed: function (collection, id, changed) {
      if (isEmpty(changed))
        return;
      results.push({fun: 'changed', id: id, changed: changed});
    },
    removed: function (collection, id) {
      results.push({fun: 'removed', id: id});
    }
  });
  var v = {
    view: view,
    results: results
  };
  ["added", "changed", "removed"].forEach(function (it) {
    v[it] = view[it].bind(view);
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

  v.added("A", "A1", {});
  v.expectResult({fun: 'added', id: "A1", fields: {}});
  v.expectNoResult();

  v.added("B", "A1", {});
  v.expectNoResult();

  v.removed("A", "A1");
  v.expectNoResult();

  v.removed("B", "A1");
  v.expectResult({fun: 'removed', id: "A1"});
  v.expectNoResult();
});

Tinytest.add('livedata - sessionview - added a second field in another sub', function (test) {
  var v = newView(test);

  v.added("A", "A1", {a: "foo"});
  v.expectResult({fun: 'added', id: "A1", fields: {a: "foo"}});
  v.expectNoResult();

  v.added("B", "A1", {a: "foo", b: "bar"});
  v.expectResult({fun: 'changed', 'id': "A1", changed: {b: "bar"}});

  v.removed("A", "A1");
  v.expectNoResult();

  v.removed("B", "A1");
  v.expectResult({fun: 'removed', id: "A1"});
  v.expectNoResult();
});


Tinytest.add('livedata - sessionview - field reveal', function (test) {
  var v = newView(test);

  v.added("A",  "A1", {foo: "bar"});
  v.expectResult({fun: 'added', id: "A1", fields: {foo: "bar"}});
  v.expectNoResult();

  v.added("B",  "A1", {foo: "baz"});
  v.removed("A", "A1");
  v.expectResult({fun: 'changed', id: "A1", changed: {foo: "baz"}});
  v.expectNoResult();
  // Somewhere in here we must have changed foo to baz. Legal either on the
  // added or on the removed, but only once.

  v.removed("B", "A1");
  v.expectResult({fun: 'removed', id: "A1"});
  v.expectNoResult();
});

Tinytest.add('livedata - sessionview - field change', function (test) {
  var v = newView(test);

  v.added("A",  "A1", {foo: "bar"});
  v.expectResult({fun: 'added', id: "A1", fields: {foo: "bar"}});
  v.expectNoResult();

  v.changed("A", "A1", {foo: "baz"}, []);
  v.expectResult({fun: 'changed', id: "A1", changed: {foo: "baz"}});
  v.expectNoResult();

  v.removed("A", "A1");
  v.expectResult({fun: 'removed', id: "A1"});
  v.expectNoResult();
});

Tinytest.add('livedata - sessionview - field clear', function (test) {
  var v = newView(test);

  v.added("A",  "A1", {foo: "bar"});
  v.expectResult({fun: 'added', id: "A1", fields: {foo: "bar"}});
  v.expectNoResult();

  v.changed("A", "A1", {foo: undefined});
  v.expectResult({fun: 'changed', id: "A1", changed: {foo: undefined}});
  v.expectNoResult();

  v.removed("A", "A1");
  v.expectResult({fun: 'removed', id: "A1"});
  v.expectNoResult();
});

Tinytest.add('livedata - sessionview - change makes a new field', function (test) {
  var v = newView(test);

  v.added("A",  "A1", {foo: "bar"});
  v.expectResult({fun: 'added', id: "A1", fields: {foo: "bar"}});
  v.expectNoResult();

  v.changed("A", "A1", {baz:"quux"});
  v.expectResult({fun: 'changed', id: "A1", changed: {baz: "quux"}});
  v.expectNoResult();
});

Tinytest.add('livedata - sessionview - add, remove, add', function (test) {
  var v = newView(test);

  v.added("A",  "A1", {foo: "bar"});
  v.expectResult({fun: 'added', id: "A1", fields: {foo: "bar"}});
  v.expectNoResult();

  v.removed("A", "A1");
  v.expectResult({fun: 'removed', id: "A1"});
  v.expectNoResult();

  v.added("A",  "A1", {foo: "bar"});
  v.expectResult({fun: 'added', id: "A1", fields: {foo: "bar"}});
  v.expectNoResult();

});

Tinytest.add('livedata - sessionview - field clear reveal', function (test) {
  var v = newView(test);

  v.added("A",  "A1", {foo: "bar"});
  v.expectResult({fun: 'added', id: "A1", fields: {foo: "bar"}});
  v.expectNoResult();


  v.added("B",  "A1", {foo: "baz"});
  v.changed("A", "A1", {foo: undefined});
  v.expectResult({fun: 'changed', id: "A1", changed: {foo: "baz"}});
  v.expectNoResult();

  v.removed("A", "A1");
  v.expectNoResult();
  v.removed("B", "A1");
  v.expectResult({fun: 'removed', id: "A1"});
  v.expectNoResult();
});

Tinytest.add('livedata - sessionview - change to canonical value produces no change', function (test) {
  var v = newView(test);

  v.added("A",  "A1", {foo: "bar"});
  v.expectResult({fun: 'added', id: "A1", fields: {foo: "bar"}});
  v.expectNoResult();


  v.added("B",  "A1", {foo: "baz"});
  var canon = "bar";
  var maybeResults = v.drain();
  if (!isEmpty(maybeResults)) {
    // if something happened, it was a change message to baz.
    // if nothing did, canon is still bar.
    test.length(maybeResults, 1);
    test.equal(maybeResults[0], {fun: 'changed', id: "A1", changed: {foo: "baz"}});
    canon = "baz";
  }
  v.changed("B", "A1", {foo: canon});
  v.expectNoResult();

  v.removed("A", "A1");
  v.expectNoResult();
  v.removed("B", "A1");
  v.expectResult({fun: 'removed', id: "A1"});
  v.expectNoResult();
});

Tinytest.add('livedata - sessionview - new field of canonical value produces no change', function (test) {
  var v = newView(test);

  v.added("A",  "A1", {foo: "bar"});
  v.expectResult({fun: 'added', id: "A1", fields: {foo: "bar"}});
  v.expectNoResult();


  v.added("B",  "A1", {});

  v.changed("B", "A1", {foo: "bar"});
  v.expectNoResult();

  v.removed("A", "A1");
  v.expectNoResult();
  v.removed("B", "A1");
  v.expectResult({fun: 'removed', id: "A1"});
  v.expectNoResult();
});

Tinytest.add('livedata - sessionview - clear all clears only once', function (test) {
  var v = newView(test);

  v.added("A",  "A1", {foo: "bar"});
  v.expectResult({fun: 'added', id: "A1", fields: {foo: "bar"}});
  v.expectNoResult();

  v.added("B",  "A1", {foo: "bar"});
  v.added("C",  "A1", {foo: "bar"});
  v.changed("A", "A1", {foo: undefined});
  v.changed("B", "A1", {foo: undefined});
  v.changed("C", "A1", {foo: undefined});
  v.expectResult({fun: 'changed', id: "A1", changed: {foo: undefined}});
  v.expectNoResult();

  v.removed("A", "A1");
  v.expectNoResult();
  v.removed("B", "A1");
  v.expectNoResult();
});

Tinytest.add('livedata - sessionview - change all changes only once', function (test) {
  var v = newView(test);

  v.added("A",  "A1", {foo: "bar"});
  v.expectResult({fun: 'added', id: "A1", fields: {foo: "bar"}});
  v.expectNoResult();

  v.added("B",  "A1", {foo: "bar"});
  v.added("C",  "A1", {foo: "bar"});
  v.changed("B", "A1", {foo: "baz"});
  v.changed("A", "A1", {foo: "baz"});
  v.changed("C", "A1", {foo: "baz"});
  v.expectResult({fun: 'changed', id: "A1", changed: {foo: "baz"}});
  v.expectNoResult();

  v.removed("A", "A1");
  v.expectNoResult();
  v.removed("B", "A1");
  v.expectNoResult();
});

Tinytest.add('livedata - sessionview - multiple operations at once in a change', function (test) {
  var v = newView(test);

  v.added("A",  "A1", {foo: "bar", baz: "quux"});
  v.expectResult({fun: 'added', id: "A1", fields: {foo: "bar", baz: "quux"}});
  v.expectNoResult();


  v.added("B",  "A1", {foo: "baz"});
  v.changed("A", "A1", {thing: "stuff", foo: undefined, baz: undefined});
  v.expectResult({fun: 'changed', id: "A1", changed: {foo: "baz", thing: "stuff", baz: undefined}});
  v.expectNoResult();

  v.removed("A", "A1");
  v.expectResult({fun: 'changed', id: "A1", changed: {thing: undefined}});
  v.expectNoResult();
  v.removed("B", "A1");
  v.expectResult({fun: 'removed', id: "A1"});
  v.expectNoResult();
});

Tinytest.add('livedata - sessionview - more than one document', function (test) {
  var v = newView(test);

  v.added("A",  "A1", {foo: "bar", baz: "quux"});
  v.expectResult({fun: 'added', id: "A1", fields: {foo: "bar", baz: "quux"}});
  v.expectNoResult();


  v.added("A", "A2", {foo: "baz"});
  v.expectResult({fun: 'added', id: "A2", fields: {foo: "baz"}});
  v.changed("A", "A1", {thing: "stuff", foo: undefined, baz: undefined});
  v.expectResult({fun: 'changed', id: "A1", changed: {thing: "stuff", foo: undefined, baz: undefined}});
  v.expectNoResult();

  v.removed("A", "A1");
  v.expectResult({fun: 'removed', id: "A1"});
  v.expectNoResult();
  v.removed("A", "A2");
  v.expectResult({fun: 'removed', id: "A2"});
  v.expectNoResult();

});

Tinytest.add('livedata - sessionview - multiple docs removed', function (test) {
  var v = newView(test);

  v.added("A",  "A1", {foo: "bar", baz: "quux"});
  v.expectResult({fun: 'added', id: "A1", fields: {foo: "bar", baz: "quux"}});
  v.expectNoResult();


  v.added("A", "A2", {foo: "baz"});
  v.expectResult({fun: 'added', id: "A2", fields: {foo: "baz"}});
  v.expectNoResult();

  v.removed("A", "A1");
  v.expectResult({fun: 'removed', id: "A1"});
  v.removed("A", "A2");
  v.expectResult({fun: 'removed', id: "A2"});
  v.expectNoResult();
});


Tinytest.add('livedata - sessionview - complicated sequence', function (test) {
  var v = newView(test);

  v.added("A",  "A1", {foo: "bar", baz: "quux"});
  v.expectResult({fun: 'added', id: "A1", fields: {foo: "bar", baz: "quux"}});
  v.expectNoResult();

  v.added("A", "A2", {foo: "eats"});
  v.expectResult({fun: 'added', id: "A2", fields: {foo: "eats"}});

  v.added("B",  "A1", {foo: "baz"});
  v.changed("A", "A1", {thing: "stuff", foo: undefined, baz: undefined});
  v.expectResult({fun: 'changed', id: "A1", changed: {foo: "baz", thing: "stuff", baz: undefined}});
  v.expectNoResult();

  v.removed("A", "A1");
  v.removed("A", "A2");
  v.expectResult({fun: 'changed', id: "A1", changed: {thing: undefined}});
  v.expectResult({fun: 'removed', id: "A2"});
  v.expectNoResult();
  v.removed("B", "A1");
  v.expectResult({fun: 'removed', id: "A1"});
  v.expectNoResult();
});

Tinytest.add('livedata - sessionview - added becomes changed', function (test) {
  var v = newView(test);

  v.added('A',  "A1", {foo: 'bar'});
  v.expectResult({fun: 'added', id: "A1", fields: {foo: 'bar'}});

  v.added('B',  "A1", {hi: 'there'});
  v.expectResult({fun: 'changed', id: 'A1', changed: {hi: 'there'}});

  v.removed('A', 'A1');
  v.expectResult({fun: 'changed', id: 'A1', changed: {foo: undefined}});

  v.removed('B', 'A1');
  v.expectResult({fun: 'removed', id: 'A1'});
});

Tinytest.add('livedata - sessionview - weird key names', function (test) {
  var v = newView(test);

  v.added('A',  "A1", {});
  v.expectResult({fun: 'added', id: "A1", fields: {}});

  v.changed('A',  "A1", {constructor: 'bla'});
  v.expectResult({fun: 'changed', id: 'A1', changed: {constructor: 'bla'}});
});

Tinytest.add('livedata - sessionview - clear undefined value', function (test) {
  var v = newView(test);

  v.added("A", "A1", {field: "value"});
  v.expectResult({fun: 'added', id: "A1", fields: {field: "value"}});
  v.expectNoResult();

  v.changed("A", "A1", {field: undefined});
  v.expectResult({fun: 'changed', id: 'A1', changed: {field: undefined}});
  v.expectNoResult();

  v.changed("A", "A1", {field: undefined});
  v.expectNoResult();

});