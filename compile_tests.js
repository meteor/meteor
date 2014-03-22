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
        return Spacebars.include(self.lookupTemplate("foo"), UI.block(function() {
          var self = this;
          return "abc";
        }));
      });

  run("{{#if cond}}aaa{{else}}bbb{{/if}}",
      function() {
        var self = this;
        return UI.If(function () {
          return Spacebars.call(self.lookup("cond"));
        }, UI.block(function() {
          var self = this;
          return "aaa";
        }), UI.block(function() {
          var self = this;
          return "bbb";
        }));
      });

  run("{{> foo bar}}",
      function() {
        var self = this;
        return Spacebars.TemplateWith(function() {
          return Spacebars.call(self.lookup("bar"));
        }, UI.block(function() {
          var self = this;
          return Spacebars.include(self.lookupTemplate("foo"));
        }));
      });

  run("{{> foo x=bar}}",
      function() {
        var self = this;
        return Spacebars.TemplateWith(function() {
          return {
            x: Spacebars.call(self.lookup("bar"))
          };
        }, UI.block(function() {
          var self = this;
          return Spacebars.include(self.lookupTemplate("foo"));
        }));
      });

  run("{{> foo bar.baz}}",
      function() {
        var self = this;
        return Spacebars.TemplateWith(function() {
          return Spacebars.call(Spacebars.dot(self.lookup("bar"), "baz"));
        }, UI.block(function() {
          var self = this;
          return Spacebars.include(self.lookupTemplate("foo"));
        }));
      });

  run("{{> foo x=bar.baz}}",
      function() {
        var self = this;
        return Spacebars.TemplateWith(function() {
          return {
            x: Spacebars.call(Spacebars.dot(self.lookup("bar"), "baz"))
          };
        }, UI.block(function() {
          var self = this;
          return Spacebars.include(self.lookupTemplate("foo"));
        }));
      });

  run("{{> foo bar baz}}",
      function() {
        var self = this;
        return Spacebars.TemplateWith(function() {
          return Spacebars.dataMustache(self.lookup("bar"), self.lookup("baz"));
        }, UI.block(function() {
          var self = this;
          return Spacebars.include(self.lookupTemplate("foo"));
        }));
      });

  run("{{#foo bar baz}}aaa{{/foo}}",
      function() {
        var self = this;
        return Spacebars.TemplateWith(function() {
          return Spacebars.dataMustache(self.lookup("bar"), self.lookup("baz"));
        }, UI.block(function() {
          var self = this;
          return Spacebars.include(self.lookupTemplate("foo"), UI.block(function() {
            var self = this;
            return "aaa";
          }));
        }));
      });

  run("{{#foo p.q r.s}}aaa{{/foo}}",
      function() {
        var self = this;
        return Spacebars.TemplateWith(function() {
          return Spacebars.dataMustache(Spacebars.dot(self.lookup("p"), "q"), Spacebars.dot(self.lookup("r"), "s"));
        }, UI.block(function() {
          var self = this;
          return Spacebars.include(self.lookupTemplate("foo"), UI.block(function() {
            var self = this;
            return "aaa";
          }));
        }));
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
        return HTML.getTag("asdf")(function () {
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
