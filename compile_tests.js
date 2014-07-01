Tinytest.add("spacebars-compiler - compiler output", function (test) {

  var run = function (input, expected) {
    if (expected.fail) {
      var expectedMessage = expected.fail;
      // test for error starting with expectedMessage
      var msg = '';
      test.throws(function () {
        try {
          SpacebarsCompiler.compile(input, {isTemplate: true});
        } catch (e) {
          msg = e.message;
          throw e;
        }
      });
      test.equal(msg.slice(0, expectedMessage.length),
                 expectedMessage);
    } else {
      var output = SpacebarsCompiler.compile(input, {isTemplate: true});
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
        var view = this;
        return "abc";
      });

  run("{{foo}}",
      function() {
        var view = this;
        return Blaze.View(function() {
          return Spacebars.mustache(view.lookup("foo"));
        });
      });

  run("{{foo bar}}",
      function() {
        var view = this;
        return Blaze.View(function() {
          return Spacebars.mustache(view.lookup("foo"),
                                    view.lookup("bar"));
        });
      });

  run("{{foo x=bar}}",
      function() {
        var view = this;
        return Blaze.View(function() {
          return Spacebars.mustache(view.lookup("foo"), Spacebars.kw({
            x: view.lookup("bar")
          }));
        });
      });

  run("{{foo.bar baz}}",
      function() {
        var view = this;
        return Blaze.View(function() {
          return Spacebars.mustache(Spacebars.dot(
                   view.lookup("foo"), "bar"),
                   view.lookup("baz"));
        });
      });

  run("{{foo bar.baz}}",
      function() {
        var view = this;
        return Blaze.View(function() {
          return Spacebars.mustache(view.lookup("foo"),
                 Spacebars.dot(view.lookup("bar"), "baz"));
        });
      });

  run("{{foo x=bar.baz}}",
      function() {
        var view = this;
        return Blaze.View(function() {
          return Spacebars.mustache(view.lookup("foo"), Spacebars.kw({
            x: Spacebars.dot(view.lookup("bar"), "baz")
          }));
        });
      });

  run("{{#foo}}abc{{/foo}}",
      function() {
        var view = this;
        return Spacebars.include(view.lookupTemplate("foo"), (function() {
          return "abc";
        }));
      });

  run("{{#if cond}}aaa{{else}}bbb{{/if}}",
      function() {
        var view = this;
        return Blaze.If(function () {
          return Spacebars.call(view.lookup("cond"));
        }, (function() {
          return "aaa";
        }), (function() {
          return "bbb";
        }));
      });

  run("{{!-- --}}{{#if cond}}aaa{{!\n}}{{else}}{{!}}bbb{{!-- --}}{{/if}}{{!}}",
    function() {
      var view = this;
      return Blaze.If(function () {
        return Spacebars.call(view.lookup("cond"));
      }, (function() {
        return "aaa";
      }), (function() {
        return "bbb";
      }));
    });

  run("{{> foo bar}}",
      function() {
        var view = this;
        return Spacebars.TemplateWith(function() {
          return Spacebars.call(view.lookup("bar"));
        }, function() {
          return Spacebars.include(view.lookupTemplate("foo"));
        });
      });

  run("{{> foo x=bar}}",
      function() {
        var view = this;
        return Spacebars.TemplateWith(function() {
          return {
            x: Spacebars.call(view.lookup("bar"))
          };
        }, function() {
          return Spacebars.include(view.lookupTemplate("foo"));
        });
      }
     );

  run("{{> foo bar.baz}}",
      function() {
        var view = this;
        return Spacebars.TemplateWith(function() {
          return Spacebars.call(Spacebars.dot(view.lookup("bar"), "baz"));
        }, function() {
          return Spacebars.include(view.lookupTemplate("foo"));
        });
      });

  run("{{> foo x=bar.baz}}",
      function() {
        var view = this;
        return Spacebars.TemplateWith(function() {
          return {
            x: Spacebars.call(Spacebars.dot(view.lookup("bar"), "baz"))
          };
        }, function() {
          return Spacebars.include(view.lookupTemplate("foo"));
        });
      });

  run("{{> foo bar baz}}",
      function() {
        var view = this;
        return Spacebars.TemplateWith(function() {
          return Spacebars.dataMustache(view.lookup("bar"), view.lookup("baz"));
        }, function() {
          return Spacebars.include(view.lookupTemplate("foo"));
        });
      }
     );

  run("{{#foo bar baz}}aaa{{/foo}}",
      function() {
        var view = this;
        return Spacebars.TemplateWith(function() {
          return Spacebars.dataMustache(view.lookup("bar"), view.lookup("baz"));
        }, function() {
          return Spacebars.include(view.lookupTemplate("foo"), (function() {
            return "aaa";
          }));
        });
      });

  run("{{#foo p.q r.s}}aaa{{/foo}}",
      function() {
        var view = this;
        return Spacebars.TemplateWith(function() {
          return Spacebars.dataMustache(Spacebars.dot(view.lookup("p"), "q"), Spacebars.dot(view.lookup("r"), "s"));
        }, function() {
          return Spacebars.include(view.lookupTemplate("foo"), (function() {
            return "aaa";
          }));
        });
      });

  run("<a {{b}}></a>",
      function() {
        var view = this;
        return HTML.A(HTML.Attrs(function() {
          return Spacebars.attrMustache(view.lookup("b"));
        }));
      });

  run("<a {{b}} c=d{{e}}f></a>",
      function() {
        var view = this;
        return HTML.A(HTML.Attrs({
          c: (function() { return [ "d", Blaze.View(function() {
            return Spacebars.mustache(view.lookup("e"));
          }), "f" ]; })
        }, function() {
          return Spacebars.attrMustache(view.lookup("b"));
        }));
      });

  run("<asdf>{{foo}}</asdf>",
      function() {
        var view = this;
        return HTML.getTag("asdf")(Blaze.View(function() {
          return Spacebars.mustache(view.lookup("foo"));
        }));
      });

  run("<textarea>{{foo}}</textarea>",
      function() {
        var view = this;
        return HTML.TEXTAREA({value: (function () {
          return Blaze.View(function() {
            return Spacebars.mustache(view.lookup("foo"));
          });
        }) });
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
