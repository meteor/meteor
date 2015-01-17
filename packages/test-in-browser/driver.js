////
//// Setup
////


// dependency for the count of tests running/passed/failed, etc. drives
// the navbar and the like.
var countDep = new Tracker.Dependency;
// things that change on countDep
var running = true;
var totalCount = 0;
var passedCount = 0;
var failedCount = 0;
var failedTests = [];

// Dependency for when a new top level group is added. Each group and
// each test have their own dependency objects.
var topLevelGroupsDep = new Tracker.Dependency;

// An array of top-level groups.
//
// Each group is an object with:
// - name: string
// - path: array of strings (names of parent groups)
// - parent: parent group object (back reference)
// - dep: Tracker.Dependency object for this group. fires when new tests added.
// - groups: list of sub-groups
// - tests: list of tests in this group
//
// Each test is an object with:
// - name: string
// - parent: parent group object (back reference)
// - server: boolean
// - fullName: string
// - dep: Tracker.Dependency object for this test. fires when the test completes.
var resultTree = [];


Session.setDefault("groupPath", ["tinytest"]);
Session.set("rerunScheduled", false);

Meteor.startup(function () {
  Tracker.flush();
  Tinytest._runTestsEverywhere(reportResults, function () {
    running = false;
    Meteor.onTestsComplete && Meteor.onTestsComplete();
    countDep.changed();
    Tracker.flush();

    Meteor.connection._unsubscribeAll();
  }, Session.get("groupPath"));

});


////
//// Take incoming results and drive resultsTree
////

// report a series of events in a single test, or just the existence of
// that test if no events. this is the entry point for test results to
// this module.
var reportResults = function(results) {
  var test = _findTestForResults(results);

  // Tolerate repeated reports: first undo the effect of any previous report
  var status = _testStatus(test);
  if (status === "failed") {
    failedCount--;
    countDep.changed();
  } else if (status === "succeeded") {
    passedCount--;
    countDep.changed();
  }

  // Now process the current report
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
  status = _testStatus(test);
  if (status === "failed") {
    failedCount++;
    // Expand a failed test (but only set this if the user hasn't clicked on the
    // test name yet).
    if (test.expanded === undefined)
      test.expanded = true;
    if (!_.contains(failedTests, test.fullName))
      failedTests.push(test.fullName);

    countDep.changed();
    test.dep.changed();
  } else if (status === "succeeded") {
    passedCount++;
    countDep.changed();
    test.dep.changed();
  } else if (test.expanded) {
    // re-render the test if new results come in and the test is
    // currently expanded.
    test.dep.changed();
  }
};

// forget all of the events for a particular test
var forgetEvents = function (results) {
  var test = _findTestForResults(results);
  var status = _testStatus(test);
  if (status === "failed") {
    failedCount--;
    countDep.changed();
  } else if (status === "succeeded") {
    passedCount--;
    countDep.changed();
  }
  delete test.events;
  test.dep.changed();
};

// given a 'results' as delivered via reportResults, find the
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
        path: groupPath.slice(0, i+1),
        dep: new Tracker.Dependency
      }; // create group
      array.push(newGroup);

      if (group)
        group.dep.changed();
      else
        topLevelGroupsDep.changed();
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
    test = {
      name: testName,
      parent: group,
      server: server,
      fullName: fullName,
      dep: new Tracker.Dependency
    };
    group.tests.push(test);
    group.dep.changed();
    totalCount++;
    countDep.changed();
  }

  return test;
};



////
//// Helpers on test objects
////

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



////
//// Templates
////

//// Template - navBars

Template.navBars.helpers({
  running: function() {
    countDep.depend();
    return running;
  },
  passed: function() {
    countDep.depend();
    return failedCount === 0;
  },
  total_test_time: function() {
    countDep.depend();

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
  }
});


//// Template - progressBar

Template.progressBar.helpers({
  running: function () {
    countDep.depend();
    return running;
  },
  percentPass: function () {
    countDep.depend();
    if (totalCount === 0)
      return 0;
    return 100*passedCount/totalCount;
  },
  totalCount: function () {
    countDep.depend();
    return totalCount;
  },
  passedCount: function () {
    countDep.depend();
    return passedCount;
  },
  percentFail: function () {
    countDep.depend();
    if (totalCount === 0)
      return 0;
    return 100*failedCount/totalCount;
  },
  anyFail: function () {
    countDep.depend();
    return failedCount > 0;
  },
  barOuterClass: function () {
    countDep.depend();
    return running ? 'progress-striped' : '';
  },
  barInnerClass: function () {
    countDep.depend();
    return (failedCount > 0 ?
            'bar-warning' : 'bar-success');
  }
});

//// Template - groupNav

var changeToPath = function (path) {
  Session.set("groupPath", path);
  Session.set("rerunScheduled", true);
  // pretend there's just been a hot code push
  // so we run the tests completely fresh.
  Reload._reload();
};

Template.groupNav.helpers({
  groupPaths: function () {
    var groupPath = Session.get("groupPath");
    var ret = [];
    for (var i = 1; i <= groupPath.length; i++) {
      ret.push({path: groupPath.slice(0,i), name: groupPath[i-1]});
    }
    return ret;
  },
  rerunScheduled: function () {
    return Session.get("rerunScheduled");
  }
});

Template.groupNav.events({
  'click .group': function () {
    changeToPath(this.path);
  },
  'click .rerun': function () {
    Session.set("rerunScheduled", true);
    Reload._reload();
  }
});

Template.groupNav.onRendered(function () {
  Tinytest._onCurrentClientTest = function (name) {
    name = (name ? 'C: '+name : '');
    // Set the DOM directly so that it's immediate and we
    // don't wait for Tracker to flush.
    var span = document.getElementById('current-client-test');
    if (span) {
      span.innerHTML = '';
      span.appendChild(document.createTextNode(name));
    }
  };
});


//// Template - failedTests

Template.failedTests.helpers({
  failedTests: function() {
    countDep.depend();
    return failedTests;
  }
});

//// Template - testTable

Template.testTable.helpers({
  testdata: function () {
    topLevelGroupsDep.depend();
    return resultTree;
  },
  thisWithDep: function () {
    this.dep.depend();
    return this;
  }
});

//// Template - test_group

Template.test_group.helpers({
  thisWithDep: function () {
    this.dep.depend();
    return this;
  }
});

Template.test_group.events({
  'click .groupname': function (evt) {
    changeToPath(this.path);
    // prevent enclosing groups from also triggering on
    // same groupname.  It would be cleaner to think of
    // this as each group only listening to its *own*
    // groupname, but currently it listens to all of them.
    evt.stopImmediatePropagation();
  }
});


//// Template - test

Template.test.helpers({
  test_status_display: function() {
    var status = _testStatus(this);
    if (status == "failed") {
      return "FAIL";
    } else if (status == "succeeded") {
      return "PASS";
    } else {
      return "waiting...";
    }
  },

  test_time_display: function() {
    var time = _testTime(this);
    return (typeof time === "number") ? time + " ms" : "";
  },

  test_class: function() {
    var events = this.events || [];
    var classes = [_testStatus(this)];

    if (this.expanded) {
      classes.push("expanded");
    } else {
      classes.push("collapsed");
    }

    return classes.join(' ');
  },

  eventsArray: function() {
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
  }
});

Template.test.events({
  'click .testname': function () {
    this.expanded = ! this.expanded;
    this.dep.changed();
  }
});


//// Template - event

Template.event.events({
  'click .debug': function () {
    // the way we manage groupPath, shortName, cookies, etc, is really
    // messy. needs to be aggressively refactored.
    forgetEvents({groupPath: this.cookie.groupPath,
                  test: this.cookie.shortName});
    Tinytest._debugTest(this.cookie, reportResults);
  }
});

// e.g. doDiff('abc', 'bcd') => [[-1, 'a'], [0, 'bc'], [1, 'd']]
var doDiff = function (str1, str2) {
  var D = new diff_match_patch();
  var pieces = D.diff_main(str1, str2, false);
  D.diff_cleanupSemantic(pieces);
  return pieces;
};

Template.event.helpers({
  get_details: function() {

    var details = this.details;

    if (! details) {
      return null;
    } else {

      var type = details.type;
      var stack = details.stack;

      details = _.clone(details);
      delete details.type;
      delete details.stack;

      var prepare = function(details) {
        if (type === 'string_equal') {
          var diff = doDiff(details.actual,
                            details.expected);
        }

        return _.compact(_.map(details, function(val, key) {

          // make test._stringEqual results print nicely,
          // in particular for multiline strings
          if (type === 'string_equal' &&
              (key === 'actual' || key === 'expected')) {
            var html = '<pre class="string_equal string_equal_'+key+'">';
            _.each(diff, function (piece) {
              var which = piece[0];
              var text = piece[1];
              if (which === 0 ||
                  which === (key === 'actual' ? -1 : 1)) {
                var htmlBit = Blaze._escape(text).replace(
                    /\n/g, '<br>');
                if (which !== 0)
                  htmlBit = '<ins>' + htmlBit + '</ins>';
                html += htmlBit;
              }
            });
            html += '</pre>';
            val = new Spacebars.SafeString(html);
          }

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

      return {
        type: type,
        stack: stack,
        details: prepare(details)
      };
    }
  },

  is_debuggable: function() {
    return !!this.cookie;
  }
});
