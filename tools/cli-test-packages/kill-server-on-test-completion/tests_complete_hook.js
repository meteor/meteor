if (Meteor.isServer) {

  Meteor.methods({
    packageTestsComplete: function(results) {
      console.log("Package test results");
      console.log("---");
      console.log();
      console.log(results);
      if (results.indexOf('FAIL') === -1)
        process.exit(0);
      else
        process.exit(1);
    }
  });
} else { // isClient

  // Copied from test-in-browser/driver.js
  expandFailures = function() {
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
            t.expanded = true;
        });

        if (!walk(group.groups))
          ret = false;
      });

      return ret;
    };

    walk(resultTree);
    _resultsChanged();
  };

  Meteor.onTestsComplete = function() {
    // XXX I couldn't get this to work without setTimeout
    // (it saw "running..." in the DOM); even with a call to
    // Meteor.flush()
    setTimeout(function() {
      expandFailures();
      setTimeout(function() {
        var results = document.body.innerText;
        Meteor.call('packageTestsComplete', results);
      }, 1000);
    }, 1000);
  };
}