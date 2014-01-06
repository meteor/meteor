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
        string = string.replace(/^\(([\S\s]*)\)$/, '$1');
        if (! (Package.minifiers && Package.minifiers.UglifyJSMinify)) {
          // these tests work a lot better with access to beautification,
          // but let's at least do some sort of test without it.
          // These regexes may have to be adjusted if new tests are added.

          // Remove single-line comments, including line nums from build system.
          string = string.replace(/\/\/.*$/mg, '');
          string = string.replace(/\s+/g, ''); // kill whitespace
          // collapse identical consecutive parens
          string = string.replace(/\(+/g, '(').replace(/\)+/g, ')');
        }
        return string;
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
          return Spacebars.include(Template.foo || self.lookup("foo"), {
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
          return Spacebars.include(UI.If, {
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
          return Spacebars.include(Template.foo || self.lookup("foo"), {
            data: self.lookup("bar")
          });
        };
      });

  run("{{> foo x=bar}}",
      function() {
        var self = this;
        return function() {
          return Spacebars.include(Template.foo || self.lookup("foo"), {
            x: self.lookup("bar")
          });
        };
      });

  run("{{> foo bar.baz}}",
      function() {
        var self = this;
        return function() {
          return Spacebars.include(Template.foo || self.lookup("foo"), {
            data: function() {
              return Spacebars.call(Spacebars.dot(self.lookup("bar"), "baz"));
            }
          });
        };
      });

  run("{{> foo x=bar.baz}}",
      function() {
        var self = this;
        return function() {
          return Spacebars.include(Template.foo || self.lookup("foo"), {
            x: function() {
              return Spacebars.call(Spacebars.dot(self.lookup("bar"), "baz"));
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
          return Spacebars.include(Template.foo || self.lookup("foo"), {
            __content: UI.block(function() {
              var self = this;
              return "aaa";
            }),
            data: function() {
              return Spacebars.call(self.lookup("bar"), self.lookup("baz"));
            }
          });
        };
      });

  run("{{#foo p.q r.s}}aaa{{/foo}}",
      function() {
        var self = this;
        return function() {
          return Spacebars.include(Template.foo || self.lookup("foo"), {
            __content: UI.block(function() {
              var self = this;
              return "aaa";
            }),
            data: function() {
              return Spacebars.call(
                Spacebars.dot(self.lookup("p"), "q"),
                Spacebars.dot(self.lookup("r"), "s"));
            }
          });
        };
      });

  run("<a {{b}}></a>",
      function() {
        var self = this;
        return HTML.A({
          $dynamic: [ function() {
            return Spacebars.attrMustache(self.lookup("b"));
          } ]
        });
      });

  run("<a {{b}} c=d{{e}}f></a>",
      function() {
        var self = this;
        return HTML.A({
          c: [ "d", function() {
            return Spacebars.mustache(self.lookup("e"));
          }, "f" ],
          $dynamic: [ function() {
            return Spacebars.attrMustache(self.lookup("b"));
          } ]
        });
      });

  run("<asdf>{{foo}}</asdf>",
      function () {
        var self = this;
        return HTML.getTag("ASDF")(function () {
          return Spacebars.mustache(self.lookup("foo"));
        });
      });

  run("<textarea>{{foo}}</textarea>",
      function () {
        var self = this;
        return HTML.TEXTAREA(function () {
          return Spacebars.mustache(self.lookup("foo"));
        });
      });

});

Tinytest.add("spacebars - compiler errors", function (test) {

  var getError = function (input) {
    try {
      Spacebars.compile(input);
    } catch (e) {
      return e.message;
    }
    test.fail("Didn't throw an error: " + input);
  };

  var assertStartsWith = function (a, b) {
    test.equal(a.substring(0, b.length), b);
  };

  assertStartsWith(getError("<input></input>"),
                   "Unexpected HTML close tag.  <input> should have no close tag.");
  assertStartsWith(getError("{{#each foo}}<input></input>{{/foo}}"),
                   "Unexpected HTML close tag.  <input> should have no close tag.");
});