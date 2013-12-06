Tinytest.add("spacebars - stache tags", function (test) {

  var run = function (input, expected) {
    if (typeof expected === "string") {
      // test for error starting with string `expected`
      var msg = '';
      test.throws(function () {
        try {
          Spacebars.parseStacheTag(input);
        } catch (e) {
          msg = e.message;
          throw e;
        }
      });
      test.equal(msg.slice(0, expected.length), expected);
    } else {
      var result = Spacebars.parseStacheTag(input);
      test.equal(result.charPos, 0);
      test.equal(result.charLength, input.length);
      delete result.charPos;
      delete result.charLength;
      test.equal(result, expected);
    }
  };

  run('{{foo}}', {type: 'DOUBLE', path: ['foo'], args: []});
  run('{{foo3}}', {type: 'DOUBLE', path: ['foo3'], args: []});
  run('{{{foo}}}', {type: 'TRIPLE', path: ['foo'], args: []});
  run('{{{foo}}', "Expected `}}}`");
  run('{{{foo', "Expected");
  run('{{foo', "Expected");
  run('{{ {foo}}}', "Unknown stache tag");
  run('{{{{foo}}}}', "Unknown stache tag");
  run('{{{>foo}}}', "Unknown stache tag");
  run('{{>>foo}}', "Unknown stache tag");
  run('{{! asdf }}', {type: 'COMMENT', value: ' asdf '});
  run('{{ ! asdf }}', {type: 'COMMENT', value: ' asdf '});
  run('{{ ! asdf }asdf', "Unclosed");
  run('{{else}}', {type: 'ELSE'});
  run('{{ else }}', {type: 'ELSE'});
  run('{{else x}}', "Expected");
  run('{{else_x}}', {type: 'DOUBLE', path: ['else_x'], args: []});
  run('{{/if}}', {type: 'BLOCKCLOSE', path: ['if']});
  run('{{ / if }}', {type: 'BLOCKCLOSE', path: ['if']});
  run('{{/if x}}', "Expected");
  run('{{#if}}', {type: 'BLOCKOPEN', path: ['if'], args: []});
  run('{{ # if }}', {type: 'BLOCKOPEN', path: ['if'], args: []});
  run('{{#if_3}}', {type: 'BLOCKOPEN', path: ['if_3'], args: []});
  run('{{>x}}', {type: 'INCLUSION', path: ['x'], args: []});
  run('{{ > x }}', {type: 'INCLUSION', path: ['x'], args: []});
  run('{{>x_3}}', {type: 'INCLUSION', path: ['x_3'], args: []});



  run('{{foo 3}}', {type: 'DOUBLE', path: ['foo'], args: [['NUMBER', 3]]});
  run('{{ foo  3 }}', {type: 'DOUBLE', path: ['foo'], args: [['NUMBER', 3]]});
  run('{{#foo 3}}', {type: 'BLOCKOPEN', path: ['foo'], args: [['NUMBER', 3]]});
  run('{{ # foo  3 }}', {type: 'BLOCKOPEN', path: ['foo'],
                         args: [['NUMBER', 3]]});
  run('{{>foo 3}}', {type: 'INCLUSION', path: ['foo'], args: [['NUMBER', 3]]});
  run('{{>foo 3 4}}', "Only one positional argument");
  run('{{ > foo  3 }}', {type: 'INCLUSION', path: ['foo'],
                         args: [['NUMBER', 3]]});
  run('{{{foo 3}}}', {type: 'TRIPLE', path: ['foo'], args: [['NUMBER', 3]]});

  run('{{foo bar baz=qux x3=. ./foo foo/bar a.b.c}}',
      {type: 'DOUBLE', path: ['foo'],
       args: [['PATH', ['bar']],
              ['PATH', ['qux'], 'baz'],
              ['PATH', ['.'], 'x3'],
              ['PATH', ['.', 'foo']],
              ['PATH', ['foo', 'bar']],
              ['PATH', ['a', 'b', 'c']]]});

  run('{{{x 0.3 [0].[3] .4 ./[4]}}}',
      {type: 'TRIPLE', path: ['x'],
       args: [['NUMBER', 0.3],
              ['PATH', ['0', '3']],
              ['NUMBER', .4],
              ['PATH', ['.', '4']]]});

  run('{{# foo this this.x null z=null}}',
      {type: 'BLOCKOPEN', path: ['foo'],
       args: [['PATH', ['.']],
              ['PATH', ['.', 'x']],
              ['NULL', null],
              ['NULL', null, 'z']]});

  run('{{./foo 3}}', {type: 'DOUBLE', path: ['.', 'foo'], args: [['NUMBER', 3]]});
  run('{{this/foo 3}}', {type: 'DOUBLE', path: ['.', 'foo'], args: [['NUMBER', 3]]});
  run('{{../foo 3}}', {type: 'DOUBLE', path: ['..', 'foo'], args: [['NUMBER', 3]]});
  run('{{../../foo 3}}', {type: 'DOUBLE', path: ['...', 'foo'], args: [['NUMBER', 3]]});

  run('{{foo x/..}}', "Expected");
  run('{{foo x/.}}', "Expected");

  run('{{#a.b.c}}', {type: 'BLOCKOPEN', path: ['a', 'b', 'c'],
                     args: []});
  run('{{> a.b.c}}', {type: 'INCLUSION', path: ['a', 'b', 'c'],
                      args: []});

  run('{{foo.[]/[]}}', {type: 'DOUBLE', path: ['foo', '', ''],
                        args: []});
  run('{{[].foo}}', "Path can't start with empty string");

  run('{{foo null}}', {type: 'DOUBLE', path: ['foo'],
                       args: [['NULL', null]]});
  run('{{foo false}}', {type: 'DOUBLE', path: ['foo'],
                       args: [['BOOLEAN', false]]});
  run('{{foo true}}', {type: 'DOUBLE', path: ['foo'],
                       args: [['BOOLEAN', true]]});
  run('{{foo "bar"}}', {type: 'DOUBLE', path: ['foo'],
                        args: [['STRING', 'bar']]});
  run("{{foo 'bar'}}", {type: 'DOUBLE', path: ['foo'],
                        args: [['STRING', 'bar']]});

  run('{{foo -1 -2}}', {type: 'DOUBLE', path: ['foo'],
                        args: [['NUMBER', -1], ['NUMBER', -2]]});
});


Tinytest.add("spacebars - Spacebars.dot", function (test) {
  test.equal(Spacebars.dot(null, 'foo'), null);
  test.equal(Spacebars.dot('foo', 'foo'), undefined);
  test.equal(Spacebars.dot({x:1}, 'x'), 1);
  test.equal(Spacebars.dot(
    {x:1, y: function () { return this.x+1; }}, 'y')(), 2);
  test.equal(Spacebars.dot(
    function () {
      return {x:1, y: function () { return this.x+1; }};
    }, 'y')(), 2);

  var m = 1;
  var mget = function () {
    return {
      answer: m,
      getAnswer: function () {
        return this.answer;
      }
    };
  };
  var mgetDotAnswer = Spacebars.dot(mget, 'answer');
  test.equal(mgetDotAnswer, 1);

  m = 3;
  var mgetDotGetAnswer = Spacebars.dot(mget, 'getAnswer');
  test.equal(mgetDotGetAnswer(), 3);
  m = 4;
  test.equal(mgetDotGetAnswer(), 3);

  var closet = {
    mget: mget,
    mget2: function () {
      return this.mget();
    }
  };

  m = 5;
  var f1 = Spacebars.dot(closet, 'mget', 'answer');
  m = 6;
  var f2 = Spacebars.dot(closet, 'mget2', 'answer');
  test.equal(f2, 6);
  m = 8;
  var f3 = Spacebars.dot(closet, 'mget2', 'getAnswer');
  m = 9;
  test.equal(f3(), 8);

  test.equal(Spacebars.dot(0, 'abc', 'def'), 0);
  test.equal(Spacebars.dot(function () { return null; }, 'abc', 'def'), null);
  test.equal(Spacebars.dot(function () { return 0; }, 'abc', 'def'), 0);

  // test that in `foo.bar`, `bar` may be a function that takes arguments.
  test.equal(Spacebars.dot(
    { one: 1, inc: function (x) { return this.one + x; } }, 'inc')(6), 7);
  test.equal(Spacebars.dot(
    function () {
      return { one: 1, inc: function (x) { return this.one + x; } };
    }, 'inc')(8), 9);

});

//////////////////////////////////////////////////

Tinytest.add("spacebars - parse", function (test) {
  test.equal(UI.toCode(Spacebars.parse('{{foo}}')),
             'HTML.Special({type: "DOUBLE", path: ["foo"]})');

  test.equal(UI.toCode(Spacebars.parse('{{!foo}}')), 'null');
  test.equal(UI.toCode(Spacebars.parse('x{{!foo}}y')), '"xy"');

  test.equal(UI.toCode(Spacebars.parse('{{#foo}}x{{/foo}}')),
             'HTML.Special({type: "BLOCKOPEN", path: ["foo"], content: "x"})');

  test.equal(UI.toCode(Spacebars.parse('{{#foo}}{{#bar}}{{/bar}}{{/foo}}')),
             'HTML.Special({type: "BLOCKOPEN", path: ["foo"], content: HTML.Special({type: "BLOCKOPEN", path: ["bar"], content: null})})');

  test.equal(UI.toCode(Spacebars.parse('<div>hello</div> {{#foo}}<div>{{#bar}}world{{/bar}}</div>{{/foo}}')),
             '[HTML.Tag.DIV("hello"), " ", HTML.Special({type: "BLOCKOPEN", path: ["foo"], content: HTML.Tag.DIV(HTML.Special({type: "BLOCKOPEN", path: ["bar"], content: "world"}))})]');

});
