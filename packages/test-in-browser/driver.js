var running = true;

var resultTree = [];
var failedTests = [];
var resultsDeps = new Deps.Dependency;
var countDeps = new Deps.Dependency;
var totalCount = 0;
var passedCount = 0;
var failedCount = 0;


Session.setDefault("groupPath", ["tinytest"]);
Session.set("rerunScheduled", false);

Meteor.startup(function () {
  Deps.flush();
  Meteor._runTestsEverywhere(reportResults, function () {
    running = false;
    Meteor.onTestsComplete && Meteor.onTestsComplete();
    resultsDeps.changed();
    Deps.flush();

    Meteor.default_connection._unsubscribeAll();
  }, Session.get("groupPath"));

});

Template.progressBar.running = function () {
  countDeps.depend();
  return passedCount + failedCount < totalCount;
};

Template.progressBar.percentPass = function () {
  countDeps.depend();
  if (totalCount === 0)
    return 0;
  return 100*passedCount/totalCount;
};

Template.progressBar.totalCount = function () {
  return totalCount;
};

Template.progressBar.passedCount = function () {
  return passedCount;
};

Template.progressBar.percentFail = function () {
  countDeps.depend();
  if (totalCount === 0)
    return 0;
  return 100*failedCount/totalCount;
};

Template.progressBar.anyFail = function () {
  countDeps.depend();
  return failedCount > 0;
};

Template.groupNav.groupPaths = function () {
  var groupPath = Session.get("groupPath");
  var ret = [];
  for (var i = 1; i <= groupPath.length; i++) {
    ret.push({path: groupPath.slice(0,i), name: groupPath[i-1]});
  }
  return ret;
};

Template.groupNav.rerunScheduled = function () {
  return Session.get("rerunScheduled");
};

var changeToPath = function (path) {
  Session.set("groupPath", path);
  Session.set("rerunScheduled", true);
  // pretend there's just been a hot code push
  // so we run the tests completely fresh.
  Meteor._reload.reload();
};

Template.groupNav.events({
  "click .group": function () {
    changeToPath(this.path);
  },
  "click .rerun": function () {
    Session.set("rerunScheduled", true);
    Meteor._reload.reload();
  }
});

Template.test_group.events({
  "click .groupname": function () {
    changeToPath(this.path);
  }
});

Template.test_table.running = function() {
  resultsDeps.depend();
  return running;
};

Template.test_table.passed = function() {
  resultsDeps.depend();

  // walk whole tree to look for failed tests
  var walk = function (groups) {
    var ret = true;

    _.each(groups || [], function (group) {
      if (!ret)
        return;

      _.each(group.tests || [], function (t) {
        if (!ret)
          return;
        if (_testStatus(t) === "failed")
          ret = false;
      });

      if (!walk(group.groups))
        ret = false;
    });

    return ret;
  };

  return walk(resultTree);
};


Template.test_table.total_test_time = function() {
  resultsDeps.depend();

  // walk whole tree to get all tests
  var walk = function (groups) {
    var total = 0;

    _.each(groups || [], function (group) {
      _.each(group.tests || [], function (t) {
        total += _testTime(t);
      });

      total += walk(group.groups);
    });

    return total;
  };

  return walk(resultTree);
};



Template.test_table.data = function() {
  resultsDeps.depend();
  return resultTree;
};
Template.test_table.failedTests = function() {
  resultsDeps.depend();
  return failedTests;
};

Template.test.test_status_display = function() {
  var status = _testStatus(this);
  if (status == "failed") {
    return "FAIL";
  } else if (status == "succeeded") {
    return "PASS";
  } else {
    return "waiting...";
  }
};

Template.test.test_time_display = function() {
  var time = _testTime(this);
  return (typeof time === "number") ? time + " ms" : "";
};

Template.test.test_class = function() {
  var events = this.events || [];
  var classes = [_testStatus(this)];

  if (this.expanded) {
    classes.push("expanded");
  } else {
    classes.push("collapsed");
  }

  return classes.join(' ');
};

Template.test.events({
  'click .testname': function() {
    this.expanded = ! this.expanded;
    resultsDeps.changed();
  }
});

Template.test.eventsArray = function() {
  var events = _.filter(this.events, function(e) {
    return e.type != "finish";
  });

  var partitionBy = function(seq, func) {
    var result = [];
    var lastValue = {};
    _.each(seq, function(x) {
      var newValue = func(x);
      if (newValue === lastValue) {
        result[result.length-1].push(x);
      } else {
        lastValue = newValue;
        result.push([x]);
      }
    });
    return result;
  };

  var dupLists = partitionBy(
    _.map(events, function(e) {
      // XXX XXX We need something better than stringify!
      // stringify([undefined]) === "[null]"
      e = _.clone(e);
      delete e.sequence;
      return {obj: e, str: JSON.stringify(e)};
    }), function(x) { return x.str; });

  return _.map(dupLists, function(L) {
    var obj = L[0].obj;
    return (L.length > 1) ? _.extend({times: L.length}, obj) : obj;
  });
};

Template.event.events({
  'click .debug': function () {
    // the way we manage groupPath, shortName, cookies, etc, is really
    // messy. needs to be aggressively refactored.
    forgetEvents({groupPath: this.cookie.groupPath,
                  test: this.cookie.shortName});
    Meteor._debugTest(this.cookie, reportResults);
  }
});

Template.event.get_details = function() {

  var prepare = function(details) {
    return _.compact(_.map(details, function(val, key) {

      // You can end up with a an undefined value, e.g. using
      // isNull without providing a message attribute: isNull(1).
      // No need to display those.
      if (!_.isUndefined(val)) {
        return {
          key: key,
          val: val
        };
      } else {
        return undefined;
      }
    }));
  };

  var details = this.details;

  if (! details) {
    return null;
  } else {

    var type = details.type;
    var stack = details.stack;

    details = _.clone(details);
    delete details.type;
    delete details.stack;

    return {
      type: type,
      stack: stack,
      details: prepare(details)
    };
  }
};

Template.event.is_debuggable = function() {
  return !!this.cookie;
};

var _testTime = function(t) {
  if (t.events && t.events.length > 0) {
    var lastEvent = _.last(t.events);
    if (lastEvent.type === "finish") {
      if ((typeof lastEvent.timeMs) === "number") {
        return lastEvent.timeMs;
      }
    }
  }
  return null;
};

var _testStatus = function(t) {
  var events = t.events || [];
  if (_.find(events, function(x) { return x.type === "exception"; })) {
    // "exception" should be last event, except race conditions on the
    // server can make this not the case.  Technically we can't tell
    // if the test is still running at this point, but it can only
    // result in FAIL.
    return "failed";
  } else if (events.length == 0 || (_.last(events).type != "finish")) {
    return "running";
  } else if (_.any(events, function(e) {
    return e.type == "fail" || e.type == "exception"; })) {
    return "failed";
  } else {
    return "succeeded";
  }
};

// given a 'results' as delivered via setReporter, find the
// corresponding leaf object in resultTree, creating one if it doesn't
// exist. it will be an object with attributes 'name', 'parent', and
// possibly 'events'.
var _findTestForResults = function (results) {
  var groupPath = results.groupPath; // array
  if ((! _.isArray(groupPath)) || (groupPath.length < 1)) {
    throw new Error("Test must be part of a group");
  }

  var group;
  var i = 0;
  _.each(groupPath, function(gname) {
    var array = (group ? (group.groups || (group.groups = []))
                 : resultTree);
    var newGroup = _.find(array, function(g) { return g.name === gname; });
    if (! newGroup) {
      newGroup = {
        name: gname,
        parent: (group || null),
        path: groupPath.slice(0, i+1)
      }; // create group
      array.push(newGroup);
    }
    group = newGroup;
    i++;
  });

  var testName = results.test;
  var server = !!results.server;
  var test = _.find(group.tests || (group.tests = []),
                    function(t) { return t.name === testName &&
                                  t.server === server; });
  if (! test) {
    // create test
    var nameParts = _.clone(groupPath);
    nameParts.push(testName);
    var fullName = nameParts.join(' - ');
    test = {name: testName, parent: group, server: server, fullName: fullName};
    group.tests.push(test);
    totalCount++;
    countDeps.changed();
  }

  return test;
};

// report a series of events in a single test, or just
// the existence of that test if no events
var reportResults = function(results) {
  var test = _findTestForResults(results);

  if (_.isArray(results.events)) {
    // append events, if present
    Array.prototype.push.apply((test.events || (test.events = [])),
                               results.events);
    // sort and de-duplicate, based on sequence number
    test.events.sort(function (a, b) {
      return a.sequence - b.sequence;
    });
    var out = [];
    _.each(test.events, function (e) {
      if (out.length === 0 || out[out.length - 1].sequence !== e.sequence)
        out.push(e);
    });
    test.events = out;
  }
  var status = _testStatus(test);
  if (status === "failed") {
    failedCount++;
    countDeps.changed();
    // Expand a failed test (but only set this if the user hasn't clicked on the
    // test name yet).
    if (test.expanded === undefined)
      test.expanded = true;
    if (!_.contains(failedTests, test.fullName))
      failedTests.push(test.fullName);
  } else if (status === "succeeded") {
    passedCount++;
    countDeps.changed();
  }

  _throttled_update();
};

// forget all of the events for a particular test
var forgetEvents = function (results) {
  var test = _findTestForResults(results);
  var status = _testStatus(test);
  if (status === "failed") {
    failedCount--;
    countDeps.changed();
  } else if (status === "succeeded") {
    passedCount--;
    countDeps.changed();
  }
  delete test.events;
  resultsDeps.changed();
};

var _throttled_update = _.throttle(function() {
  resultsDeps.changed();
}, 1000);
