Tinytest.add("spacebars-compiler - compiler output", function (test) {

  var run = function (input, expected) {
    if (expected.fail) {
      var expectedMessage = expected.fail;
      // test for error starting with expectedMessage
      var msg = '';
      test.throws(function () {
        try {
          SpacebarsCompiler.compile(input);
        } catch (e) {
          msg = e.message;
          throw e;
        }
      });
      test.equal(msg.slice(0, expectedMessage.length),
                 expectedMessage);
    } else {
      var output = SpacebarsCompiler.compile(input);
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
        }
        return string;
      };
      // compare using Function .toString()!
      test._stringEqual(
        postProcess(output.toString()),
        postProcess(
          SpacebarsCompiler._beautify('(' + expected.toString() + ')')),
        input);
    }
  };



  run("abc",
      function () {
        return "abc";
      });

  run("{{foo}}",
      function() {
        return Blaze.Isolate(function() {
          return Spacebars.mustache(Blaze.lookup("foo", self));
        });
      });

  run("{{foo bar}}",
      function() {
        return Blaze.Isolate(function() {
          return Spacebars.mustache(Blaze.lookup("foo", self),
                                    Blaze.lookup("bar", self));
        });
      });

  run("{{foo x=bar}}",
      function() {
        return Blaze.Isolate(function() {
          return Spacebars.mustache(Blaze.lookup("foo", self), Spacebars.kw({
            x: Blaze.lookup("bar", self)
          }));
        });
      });

  run("{{foo.bar baz}}",
      function() {
        return Blaze.Isolate(function() {
          return Spacebars.mustache(Spacebars.dot(
                   Blaze.lookup("foo", self), "bar"),
                   Blaze.lookup("baz", self));
        });
      });

  run("{{foo bar.baz}}",
      function() {
        return Blaze.Isolate(function() {
          return Spacebars.mustache(Blaze.lookup("foo", self),
                 Spacebars.dot(Blaze.lookup("bar", self), "baz"));
        });
      });

  run("{{foo x=bar.baz}}",
      function() {
        return Blaze.Isolate(function() {
          return Spacebars.mustache(Blaze.lookup("foo", self), Spacebars.kw({
            x: Spacebars.dot(Blaze.lookup("bar", self), "baz")
          }));
        });
      });

  run("{{#foo}}abc{{/foo}}",
      function() {
        return Blaze.Isolate(function() {
          return Spacebars.include2(Blaze.lookupTemplate("foo", self),
            null,
            (function() { return "abc"; })
          );
        });
      });

  run("{{#if cond}}aaa{{else}}bbb{{/if}}",
      function() {
        return Blaze.If(function () {
          return Spacebars.call(Blaze.lookup("cond", self));
        }, (function() {
          return "aaa";
        }), (function() {
          return "bbb";
        }));
      });

  run("{{> foo bar}}",
      function() {
        return Blaze.Isolate(function() {
          return Spacebars.include2(Blaze.lookupTemplate("foo", self),
                                    function () {
                                      return Spacebars.call(Blaze.lookup("bar", self));
                                    });
        });
      });

  run("{{> foo x=bar}}",
      function() {
        return Blaze.Isolate(function() {
          return Spacebars.include2(Blaze.lookupTemplate("foo", self),
                                function () {
                                  return {x: Spacebars.call(Blaze.lookup("bar", self))};
                                });
        });
      });

  run("{{> foo bar.baz}}",
      function() {
        return Blaze.Isolate(function() {
          return Spacebars.include2(Blaze.lookupTemplate("foo", self),
                 function () {
                   return Spacebars.call(Spacebars.dot(Blaze.lookup("bar", self),
                                                "baz"));
                 });
        });
      });

  run("{{> foo x=bar.baz}}",
      function() {
        return Blaze.Isolate(function() {
          return Spacebars.include2(Blaze.lookupTemplate("foo", self), function () {
            return {
              x: Spacebars.call(Spacebars.dot(Blaze.lookup("bar", self), "baz"))
            };
          });
        });
      });

  run("{{> foo bar baz}}",
      function() {
        return Blaze.Isolate(function() {
          return Spacebars.include2(Blaze.lookupTemplate("foo", self),
                 function () {
                   return Spacebars.dataMustache(Blaze.lookup("bar", self),
                                                 Blaze.lookup("baz", self));
                 });
        });
      });

  run("{{#foo bar baz}}aaa{{/foo}}",
      function() {
        return Blaze.Isolate(function() {
          return Spacebars.include2(Blaze.lookupTemplate("foo", self),
                 function () {
                   return Spacebars.dataMustache(Blaze.lookup("bar", self),
                                                 Blaze.lookup("baz", self));
                 },
                 (function() {
                   return "aaa";
                 }));
        });
      });

  run("{{#foo p.q r.s}}aaa{{/foo}}",
      function() {
        return Blaze.Isolate(function() {
          return Spacebars.include2(Blaze.lookupTemplate("foo", self),
                 function () {
                   return Spacebars.dataMustache(Spacebars.dot(
                     Blaze.lookup("p", self), "q"),
                                                 Spacebars.dot(Blaze.lookup("r", self), "s"));
                 },
                 (function() {
                   return "aaa";
                 }));
        });
      });

  run("<a {{b}}></a>",
      function() {
        return HTML.A(HTML.Attrs(Blaze.Var(function() {
          return Spacebars.attrMustache(Blaze.lookup("b", self));
        })));
      });

  run("<a {{b}} c=d{{e}}f></a>",
      function() {
        return HTML.A(HTML.Attrs({
          c: [ "d", Blaze.Isolate(function() {
            return Spacebars.mustache(Blaze.lookup("e", self));
          }), "f" ]
        }, Blaze.Var(function() {
          return Spacebars.attrMustache(Blaze.lookup("b", self));
        })));
      });

  run("<asdf>{{foo}}</asdf>",
      function() {
        return HTML.getTag("asdf")(Blaze.Isolate(function() {
          return Spacebars.mustache(Blaze.lookup("foo", self));
        }));
      });

  run("<textarea>{{foo}}</textarea>",
      function() {
        return HTML.TEXTAREA(Blaze.Isolate(function() {
          return Spacebars.mustache(Blaze.lookup("foo", self));
        }));
      });

});

Tinytest.add("spacebars-compiler - compiler errors", function (test) {

  var getError = function (input) {
    try {
      SpacebarsCompiler.compile(input);
    } catch (e) {
      return e.message;
    }
    test.fail("Didn't throw an error: " + input);
  };

  var assertStartsWith = function (a, b) {
    test.equal(a.substring(0, b.length), b);
  };

  var isError = function (input, errorStart) {
    assertStartsWith(getError(input), errorStart);
  };

  isError("<input></input>",
          "Unexpected HTML close tag.  <input> should have no close tag.");
  isError("{{#each foo}}<input></input>{{/foo}}",
          "Unexpected HTML close tag.  <input> should have no close tag.");

  isError("{{#if}}{{/if}}", "#if requires an argument");
  isError("{{#with}}{{/with}}", "#with requires an argument");
  isError("{{#each}}{{/each}}", "#each requires an argument");
  isError("{{#unless}}{{/unless}}", "#unless requires an argument");

  isError("{{0 0}}", "Expected IDENTIFIER");

  isError("{{> foo 0 0}}",
          "First argument must be a function");
  isError("{{> foo 0 x=0}}",
          "First argument must be a function");
  isError("{{#foo 0 0}}{{/foo}}",
          "First argument must be a function");
  isError("{{#foo 0 x=0}}{{/foo}}",
          "First argument must be a function");

  _.each(['asdf</br>', '{{!foo}}</br>', '{{!foo}} </br>',
          'asdf</a>', '{{!foo}}</a>', '{{!foo}} </a>'], function (badFrag) {
            isError(badFrag, "Unexpected HTML close tag");
          });
});
