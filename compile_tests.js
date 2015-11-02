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
        if (! (Package['minifiers-js'] && Package['minifiers-js'].UglifyJSMinify)) {
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

  coffee.runCompilerOutputTests(run);
});

coffee = {
  runCompilerOutputTests: null // implemented in compiler_output_tests.coffee
};


Tinytest.add("spacebars-compiler - compiler errors", function (test) {

  var getError = function (input) {
    try {
      SpacebarsCompiler.compile(input);
    } catch (e) {
      return e.message;
    }
    test.fail("Didn't throw an error: " + input);
    return '';
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

  isError("{{#let myHelper}}{{/let}}", "Incorrect form of #let");
  isError("{{#each foo in.in bar}}{{/each}}", "Malformed #each");
  isError("{{#each foo.bar in baz}}{{/each}}", "Bad variable name in #each");
  isError("{{#each ../foo in baz}}{{/each}}", "Bad variable name in #each");
  isError("{{#each 3 in baz}}{{/each}}", "Bad variable name in #each");

  // errors using `{{> React}}`
  isError("{{> React component=emptyComponent}}",
          "{{> React}} must be used in a container element");
  isError("<div>{{#if include}}{{> React component=emptyComponent}}{{/if}}</div>",
          "{{> React}} must be used in a container element");
  isError("<div><div>Sibling</div>{{> React component=emptyComponent}}</div>",
          "{{> React}} must be used as the only child in a container element");
  isError("<div>Sibling{{> React component=emptyComponent}}</div>",
          "{{> React}} must be used as the only child in a container element");
  isError("<div>{{#if sibling}}Sibling{{/if}}{{> React component=emptyComponent}}</div>",
          "{{> React}} must be used as the only child in a container element");
});
