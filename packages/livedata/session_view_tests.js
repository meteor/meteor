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
  var ret = {
    view: view,
    results: results
  };
  _.each(["added", "changed", "removed"], function (it) {
    ret[it] = _.bind(view[it], view);
  });
  ret.expectResult = function (result) {
    test.equal(results.shift(), result);
  };
  ret.expectNoResult = function () {
    test.equal(results, []);
  };
  return ret;
};

Tinytest.add('livedata - sessionview - basic', function (test) {
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
