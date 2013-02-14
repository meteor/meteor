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

  Meteor.onTestsComplete = function() {
    Meteor.flush();
    var results = document.body.innerText;
    Meteor.call('packageTestsComplete', results);
  };
}