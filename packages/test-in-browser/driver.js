var running = true;

Meteor.startup(function () {
  Meteor._runTestsEverywhere(reportResults, function () {
    running = false;
    Meteor.onTestsComplete && Meteor.onTestsComplete();
    _resultsChanged();
    Meteor.flush();
    // scroll to top so we can see global pass/fail
    $("html, body").scrollTop(0);
  });
});

Template.test_table.running = function() {
  resultDeps.addCurrentContext();
  return running;
};

Template.test_table.passed = function() {
  resultDeps.addCurrentContext();

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
  resultDeps.addCurrentContext();

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
  resultDeps.addCurrentContext();
  return resultTree;
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
    _resultsChanged();
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


var resultTree = [];
var resultDeps = new Meteor.deps._ContextSet;

var _resultsChanged = function() {
  resultDeps.invalidateAll();
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
  _.each(groupPath, function(gname) {
    var array = (group ? (group.groups || (group.groups = []))
                 : resultTree);
    var newGroup = _.find(array, function(g) { return g.name === gname; });
    if (! newGroup) {
      newGroup = {name: gname, parent: (group || null)}; // create group
      array.push(newGroup);
    }
    group = newGroup;
  });

  var testName = results.test;
  var server = !!results.server;
  var test = _.find(group.tests || (group.tests = []),
                    function(t) { return t.name === testName &&
                                  t.server === server; });
  if (! test) {
    // create test
    test = {name: testName, parent: group, server: server};
    group.tests.push(test);
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

  _.defer(_throttled_update);
};

// forget all of the events for a particular test
var forgetEvents = function (test) {
  var test = _findTestForResults(test);

  delete test.events;
  _resultsChanged();
};

var _throttled_update = _.throttle(function() {
  _resultsChanged();
  Meteor.flush();
}, 500);
