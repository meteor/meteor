Tinytest.add("spacebars - compiler output", function (test) {

  var run = function (input, expected) {
    if (expected.fail) {
      var expectedMessage = expected.fail;
      // test for error starting with expectedMessage
      var msg = '';
      test.throws(function () {
        try {
          Spacebars.compile(input);
        } catch (e) {
          msg = e.message;
          throw e;
        }
      });
      test.equal(msg.slice(0, expectedMessage.length),
                 expectedMessage);
    } else {
      var output = Spacebars.compile(input);
      var postProcess = function (string) {
        // remove initial and trailing parens
        return string.replace(/^\(([\S\s]*)\)$/, '$1');
      };
      // compare using Function .toString()!
      test._stringEqual(
        postProcess(output.toString()),
        postProcess(
          Spacebars._beautify('(' + expected.toString() + ')')),
        input);
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
          return Spacebars.mustache(self.lookup("foo"));
        };
      });

  run("{{foo bar}}",
      function() {
        var self = this;
        return function() {
          return Spacebars.mustache(self.lookup("foo"), self.lookup("bar"));
        };
      });

  run("{{foo x=bar}}",
      function() {
        var self = this;
        return function() {
          return Spacebars.mustache(self.lookup("foo"), Spacebars.kw({
            x: self.lookup("bar")
          }));
        };
      });

  run("{{foo.bar baz}}",
      function() {
        var self = this;
        return function() {
          return Spacebars.mustache(Spacebars.dot(self.lookup("foo"), "bar"), self.lookup("baz"));
        };
      });

  run("{{foo bar.baz}}",
      function() {
        var self = this;
        return function() {
          return Spacebars.mustache(self.lookup("foo"), Spacebars.dot(self.lookup("bar"), "baz"));
        };
      });

  run("{{foo x=bar.baz}}",
      function() {
        var self = this;
        return function() {
          return Spacebars.mustache(self.lookup("foo"), Spacebars.kw({
            x: Spacebars.dot(self.lookup("bar"), "baz")
          }));
        };
      });

  run("{{#foo}}abc{{/foo}}",
      function() {
        var self = this;
        return function() {
          return Spacebars.include(Template["foo"] || self.lookup("foo"), {
            __content: UI.block(function() {
              var self = this;
              return "abc";
            })
          });
        };
      });

  run("{{#if cond}}aaa{{else}}bbb{{/if}}",
      function() {
        var self = this;
        return function() {
          return Spacebars.include(UI.If2, {
            __content: UI.block(function() {
              var self = this;
              return "aaa";
            }),
            __elseContent: UI.block(function() {
              var self = this;
              return "bbb";
            }),
            data: self.lookup("cond")
          });
        };
      });

  run("{{> foo bar}}",
      function() {
        var self = this;
        return function() {
          return Spacebars.include(Template["foo"] || self.lookup("foo"), {
            data: self.lookup("bar")
          });
        };
      });

  run("{{> foo x=bar}}",
      function() {
        var self = this;
        return function() {
          return Spacebars.include(Template["foo"] || self.lookup("foo"), {
            x: self.lookup("bar")
          });
        };
      });

  run("{{> foo bar.baz}}",
      function() {
        var self = this;
        return function() {
          return Spacebars.include(Template["foo"] || self.lookup("foo"), {
            data: function() {
              return Spacebars.call2(Spacebars.dot(self.lookup("bar"), "baz"));
            }
          });
        };
      });

  run("{{> foo x=bar.baz}}",
      function() {
        var self = this;
        return function() {
          return Spacebars.include(Template["foo"] || self.lookup("foo"), {
            x: function() {
              return Spacebars.call2(Spacebars.dot(self.lookup("bar"), "baz"));
            }
          });
        };
      });

  run("{{> foo bar baz}}",
      {fail: 'Only one positional argument'});

  run("{{#foo bar baz}}aaa{{/foo}}",
      function() {
        var self = this;
        return function() {
          return Spacebars.include(Template["foo"] || self.lookup("foo"), {
            __content: UI.block(function() {
              var self = this;
              return "aaa";
            }),
            data: function() {
              return Spacebars.call2(self.lookup("bar"), self.lookup("baz"));
            }
          });
        };
      });

  run("{{#foo p.q r.s}}aaa{{/foo}}",
      function() {
        var self = this;
        return function() {
          return Spacebars.include(Template["foo"] || self.lookup("foo"), {
            __content: UI.block(function() {
              var self = this;
              return "aaa";
            }),
            data: function() {
              return Spacebars.call2(
                Spacebars.dot(self.lookup("p"), "q"),
                Spacebars.dot(self.lookup("r"), "s"));
            }
          });
        };
      });
});
