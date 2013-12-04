Tinytest.add("spacebars - compiler output", function (test) {

  var run = function (input, expected) {
    if (expected.fail) {
      var expectedMessage = expected.fail;
      // test for error starting with expectedMessage
      var msg = '';
      test.throws(function () {
        try {
          Spacebars.compile2(input);
        } catch (e) {
          msg = e.message;
          throw e;
        }
      });
      test.equal(msg.slice(0, expectedMessage.length),
                 expectedMessage);
    } else {
      var output = Spacebars.compile2(input);
      // compare using Function .toString()!
      var wrapForTestDisplay = function (str) {
        return str.replace(/\n/g, ' ');
      };
      test.equal(
        wrapForTestDisplay(output.toString()),
        wrapForTestDisplay(
          Spacebars._beautify('(' + expected.toString() + ')')));
    }
  };



  run("abc",
      function () {
        var self = this;
        return "abc";
      });

  run("{{foo}}",
      function() {
        var self = this;
        return function() {
          return Spacebars.mustache2(self.lookup("foo"));
        };
      });

  run("{{foo bar}}",
      function() {
        var self = this;
        return function() {
          return Spacebars.mustache2(self.lookup("foo"), self.lookup("bar"));
        };
      });
});
