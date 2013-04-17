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
      test.equal(result.charLength, input.length);
      delete result.charLength;
      test.equal(result, expected);
    }
  }

  run('{{foo}}', {type: 'DOUBLE', path: {type: 'PATH', segments: ['foo']},
                  args: []});
  run('{{foo3}}', {type: 'DOUBLE', path: {type: 'PATH', segments: ['foo3']},
                   args: []});
  run('{{{foo}}}', {type: 'TRIPLE', path: {type: 'PATH', segments: ['foo']},
                    args: []});
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
  run('{{else_x}}', {type: 'DOUBLE', path: {type: 'PATH',
                                            segments: ['else_x']},
                     args: []});
  run('{{/if}}', {type: 'BLOCKCLOSE', name: 'if'});
  run('{{ / if }}', {type: 'BLOCKCLOSE', name: 'if'});
  run('{{/if x}}', "Expected");
  run('{{#if}}', {type: 'BLOCKOPEN', name: 'if', args: []});
  run('{{ # if }}', {type: 'BLOCKOPEN', name: 'if', args: []});
  run('{{#if_3}}', {type: 'BLOCKOPEN', name: 'if_3', args: []});
  run('{{>x}}', {type: 'INCLUSION', name: 'x', args: []});
  run('{{ > x }}', {type: 'INCLUSION', name: 'x', args: []});
  run('{{>x_3}}', {type: 'INCLUSION', name: 'x_3', args: []});



  run('{{foo 3}}', {type: 'DOUBLE', path: {type: 'PATH', segments: ['foo']},
                    args: [{type: 'NUMBER', value: 3}]});
  run('{{ foo  3 }}', {type: 'DOUBLE', path: {type: 'PATH',
                                              segments: ['foo']},
                       args: [{type: 'NUMBER', value: 3}]});
  run('{{#foo 3}}', {type: 'BLOCKOPEN', name: 'foo',
                     args: [{type: 'NUMBER', value: 3}]});
  run('{{ # foo  3 }}', {type: 'BLOCKOPEN', name: 'foo',
                         args: [{type: 'NUMBER', value: 3}]});
  run('{{>foo 3}}', {type: 'INCLUSION', name: 'foo',
                     args: [{type: 'NUMBER', value: 3}]});
  run('{{ > foo  3 }}', {type: 'INCLUSION', name: 'foo',
                         args: [{type: 'NUMBER', value: 3}]});
  run('{{{foo 3}}}', {type: 'TRIPLE', path: {type: 'PATH',
                                             segments: ['foo']},
                      args: [{type: 'NUMBER', value: 3}]});

  run('{{foo bar baz=qux x3=. ./foo foo/bar a.b.c}}',
      {type: 'DOUBLE', path: {type: 'PATH', segments: ['foo']},
       args: [{type: 'PATH', segments: ['bar']},
              {type: 'PATH', segments: ['qux'], key: 'baz'},
              {type: 'PATH', segments: [], ofThis: true, key: 'x3'},
              {type: 'PATH', segments: ['foo'], ofThis: true},
              {type: 'PATH', segments: ['foo', 'bar']},
              {type: 'PATH', segments: ['a', 'b', 'c']}]});

  run('{{{x 0.3 [0].[3] .4 ./[4]}}}',
      {type: 'TRIPLE', path: {type: 'PATH', segments: ['x']},
       args: [{type: 'NUMBER', value: 0.3},
              {type: 'PATH', segments: ['0', '3']},
              {type: 'NUMBER', value: .4},
              {type: 'PATH', segments: ['4'], ofThis: true}]});

  run('{{# foo this this.x null}}',
      {type: 'BLOCKOPEN', name: 'foo',
       args: [{type: 'PATH', segments: [], ofThis: true},
              {type: 'PATH', segments: ['x'], ofThis: true},
              {type: 'NULL'}]});

  run('{{foo ..}}', "`..` is not supported");
  run('{{foo x/..}}', "`..` is not supported");
  run('{{foo x/.}}', "`.`");

  run('{{#a.b.c}}', {type: 'BLOCKOPEN', name: 'a.b.c', args: []});
  run('{{> a.b.c}}', {type: 'INCLUSION', name: 'a.b.c', args: []});

});
