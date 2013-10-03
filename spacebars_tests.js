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
  run('{{ > foo  3 }}', {type: 'INCLUSION', path: ['foo'],
                         args: [['NUMBER', 3]]});
  run('{{{foo 3}}}', {type: 'TRIPLE', path: ['foo'], args: [['NUMBER', 3]]});

  run('{{foo bar baz=qux x3=. ./foo foo/bar a.b.c}}',
      {type: 'DOUBLE', path: ['foo'],
       args: [['PATH', ['bar']],
              ['PATH', ['qux'], 'baz'],
              ['PATH', [''], 'x3'],
              ['PATH', ['', 'foo']],
              ['PATH', ['foo', 'bar']],
              ['PATH', ['a', 'b', 'c']]]});

  run('{{{x 0.3 [0].[3] .4 ./[4]}}}',
      {type: 'TRIPLE', path: ['x'],
       args: [['NUMBER', 0.3],
              ['PATH', ['0', '3']],
              ['NUMBER', .4],
              ['PATH', ['', '4']]]});

  run('{{# foo this this.x null z=null}}',
      {type: 'BLOCKOPEN', path: ['foo'],
       args: [['PATH', ['']],
              ['PATH', ['', 'x']],
              ['NULL', null],
              ['NULL', null, 'z']]});

  run('{{foo ..}}', "`..` is not supported");
  run('{{foo x/..}}', "`..` is not supported");
  run('{{foo x/.}}', "`.`");

  run('{{#a.b.c}}', {type: 'BLOCKOPEN', path: ['a', 'b', 'c'],
                     args: []});
  run('{{> a.b.c}}', {type: 'INCLUSION', path: ['a', 'b', 'c'],
                      args: []});

  run('{{foo.[]/[]}}', {type: 'DOUBLE', path: ['foo', '', ''],
                        args: []});
  run('{{[].foo}}', "Path can't start with empty string");

  run('{{foo true}}', {type: 'DOUBLE', path: ['foo'],
                       args: [['BOOLEAN', true]]});
  run('{{foo "bar"}}', {type: 'DOUBLE', path: ['foo'],
                        args: [['STRING', 'bar']]});
  run("{{foo 'bar'}}", {type: 'DOUBLE', path: ['foo'],
                        args: [['STRING', 'bar']]});

});

Tinytest.add("spacebars - parser", function (test) {
  // check a block and reduce it to a slightly simpler form
  // for writing tests.
  var checkAndStripBlock = function (block, isTopLevel) {
    test.equal(block.type, 'block');
    test.equal(block.isBlock, true);
    delete block.isBlock;
    if (isTopLevel) {
      // top-level block has no bounding stache tags
      // and no {{else}}
      test.equal(block.openTag, null);
      test.equal(block.closeTag, null);
      test.equal(block.elseTag, null);
      test.equal(block.elseChildren, null);
      test.equal(block.elseTokens, null);
      delete block.openTag;
      delete block.closeTag;
      delete block.elseTag;
      delete block.elseChildren;
      delete block.elseTokens;
    } else {
      test.isTrue(block.openTag);
      test.isTrue(block.closeTag);
      checkAndStripTag(block.openTag);
      checkAndStripTag(block.closeTag);
      if (block.elseTag) {
        checkAndStripTag(block.elseTag);
      } else {
        // if no {{else}}, then no elseTag, elseChildren,
        // elseTokens
        test.equal(block.elseTag, null);
        test.equal(block.elseChildren, null);
        test.equal(block.elseTokens, null);
        delete block.elseTag;
        delete block.elseChildren;
        delete block.elseTokens;
      }
    }

    var checkAndStripTokens = function (tokens, children) {
      var nextChild = 0;

      _.each(tokens, function (tok) {
        switch (tok.type) {
        case 'StartTag':
          test.equal(typeof tok.name, 'string');
          _.each(tok.data, function (nv) {
            if (typeof nv.nodeName !== 'string') {
              test.isTrue(_.isArray(nv.nodeName));
              _.each(nv.nodeName, function (tagOrStr) {
                if (typeof tagOrStr !== 'string') {
                  checkAndStripTag(tagOrStr, true);
                  test.isTrue(children[nextChild++] === tagOrStr);
                }
              });
            }
            if (typeof nv.nodeValue !== 'string') {
              test.isTrue(_.isArray(nv.nodeValue));
              _.each(nv.nodeValue, function (tagOrStr) {
                if (typeof tagOrStr !== 'string') {
                  checkAndStripTag(tagOrStr, true);
                  test.isTrue(children[nextChild++] === tagOrStr);
                }
              });
            }
          });
          if (! tok.self_closing)
            delete tok.self_closing;
          break;
        case 'Characters':
        case 'Comment':
          if (typeof tok.data !== 'string') {
            test.isTrue(_.isArray(tok.data));
            _.each(tok.data, function (tagOrStr) {
              if (typeof tagOrStr !== 'string') {
                checkAndStripTag(tagOrStr);
                test.isTrue(children[nextChild++] === tagOrStr);
              }
            });
          }
          break;
        case 'EndTag':
        case 'DocType':
          test.equal(typeof tok.name, 'string');
          break;
        default:
          test.fail("Unknown token type: " + tok.type);
        }
      });

      test.equal(nextChild, children.length);
    };

    checkAndStripTokens(block.bodyTokens, block.bodyChildren);
    if (block.elseTag)
      checkAndStripTokens(block.elseTokens, block.elseChildren);

    // children already checked
    delete block.bodyChildren;
    delete block.elseChildren;

    return block;
  };

  var checkAndStripTag = function (tag, onlyStringStaches) {
    if (tag.isBlock) {
      if (onlyStringStaches)
        test.fail("Can't have block here");
      checkAndStripBlock(tag);
    } else {
      if (onlyStringStaches) {
        test.isFalse(tag.type === 'INCLUSION' ||
                     tag.type === 'BLOCKOPEN' ||
                     tag.type === 'BLOCKCLOSE' ||
                     tag.type === 'ELSE');
      }
      delete tag.charPos;
      delete tag.charLength;
    }

    return tag;
  };

  var run = function (input, expectedParse) {
    test.equal(checkAndStripBlock(Spacebars.parse(input),
                                  true),
               expectedParse);
  };

  run('<a>{{foo}}b',
    {"type":"block",
     "bodyTokens":[
       {"type":"StartTag",
        "name":"a",
        "data":[]},
       {"type":"Characters",
        "data":[
          {"type":"DOUBLE","path":["foo"],"args":[]},
          "b"]}]});

  run('<a {{foo}}={{bar}}>',
      {"type":"block",
       "bodyTokens":[
         {"type":"StartTag",
          "name":"a",
          "data":[
            {"nodeName":[
              {"type":"DOUBLE",
               "path":["foo"],
               "args":[]}],
             "nodeValue":[
               {"type":"DOUBLE",
                "path":["bar"],
                "args":[]}]}]}]});

  run('<br/>',
      {"type":"block",
       "bodyTokens":[
         {"type":"StartTag",
          "name":"br",
          "data":[],
          "self_closing":true}]});

  run('111{{#foo}}222{{#bar}}333{{/bar}}444{{/foo}}555',
      {"type":"block",
       "bodyTokens":[
         {"type":"Characters",
          "data":["111",
                  {"type":"block",
                   "openTag":{
                     "type":"BLOCKOPEN",
                     "path":["foo"],
                     "args":[]},
                   "closeTag":{
                     "type":"BLOCKCLOSE",
                     "path":["foo"]},
                   "bodyTokens":[
                     {"type":"Characters",
                      "data":["222",
                              {"type":"block",
                               "openTag":{
                                 "type":"BLOCKOPEN",
                                 "path":["bar"],
                                 "args":[]},
                               "closeTag":{
                                 "type":"BLOCKCLOSE",
                                 "path":["bar"]},
                               "bodyTokens":[
                                 {"type":"Characters",
                                  "data":"333"}]},
                              "444"]}]},
                  "555"]}]});

  run('<div>{{#foo x=y}}{{else}}<hr>{{/foo}}</div>',
      {"type":"block",
       "bodyTokens":[
         {"type":"StartTag",
          "name":"div",
          "data":[]},
         {"type":"Characters",
          "data":[
            {"type":"block",
             "openTag":{
               "type":"BLOCKOPEN",
               "path":["foo"],
               "args":[["PATH",["y"],"x"]]},
             "closeTag": {"type":"BLOCKCLOSE", "path":["foo"]},
             "bodyTokens":[],
             "elseTag": {"type":"ELSE"},
             "elseTokens":[
               {"type":"StartTag","name":"hr","data":[]}]}]},
         {"type":"EndTag","name":"div"}]});
});

Tinytest.add("spacebars - compiler", function (test) {

  var run = function (input/*, expectedLines*/) {
    var expectedLines = Array.prototype.slice.call(arguments, 1);
    var expected = expectedLines.join('\n');
    if (arguments[1].fail) {
      var expectedMessage = arguments[1].fail;
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
      test.equal(output, expected);
    }
  };

  run('abc',

      'function (buf) {',
      '  buf.write("abc");',
      '}');

  run('<a foo=bar>abc</a>',

      'function (buf) {',
      '  buf.write("<a",',
      '    {attrs: {"foo": "bar"}},',
      '    ">abc</a>");',
      '}');

  run('<a foo={{bar}}>',

      'function (buf) {',
      '  var self = this;',
      '  buf.write("<a",',
      '    {attrs: function () { return {"foo": Spacebars.dstache(self.lookup("bar"))}; }},',
      '    ">");',
      '}');

  run('<a name={{foo bar}}>',

      'function (buf) {',
      '  var self = this;',
      '  buf.write("<a",',
      '    {attrs: function () { return {"name": Spacebars.dstache(self.lookup("foo"), self.lookup("bar"))}; }},',
      '    ">");',
      '}');

  run('<a foo={{bar.baz}}>',

      'function (buf) {',
      '  var self = this;',
      '  buf.openTag("a", {"foo": function () { return String(Spacebars.call(Spacebars.index(self.lookup("bar"), "baz")) || ""); }});',
      '}');

  run('foo {{bar}} baz',

      'function (buf) {',
      '  var self = this;',
      '  buf.text("foo ");',
      '  buf.text(function () { return String(Spacebars.call(self.lookup("bar")) || ""); });',
      '  buf.text(" baz");',
      '}');

  run('foo {{{bar}}} baz',

      'function (buf) {',
      '  var self = this;',
      '  buf.text("foo ");',
      '  buf.rawHtml(function () { return String(Spacebars.call(self.lookup("bar")) || ""); });',
      '  buf.text(" baz");',
      '}');

  run('foo {{bar "hello"}} baz',

      'function (buf) {',
      '  var self = this;',
      '  buf.text("foo ");',
      '  buf.text(function () { return String(Spacebars.call(self.lookup("bar"), "hello") || ""); });',
      '  buf.text(" baz");',
      '}');

  run('foo {{bar hello}} baz',

      'function (buf) {',
      '  var self = this;',
      '  buf.text("foo ");',
      '  buf.text(function () { return String(Spacebars.call(self.lookup("bar"), Spacebars.call(self.lookup("hello"))) || ""); });',
      '  buf.text(" baz");',
      '}');

  run('{{foo.bar x.y abc=z.w 0 null "hi" z=123.4}}',

      'function (buf) {',
      '  var self = this;',
      '  buf.text(function () { return String(Spacebars.call(Spacebars.index(self.lookup("foo"), "bar"), Spacebars.call(Spacebars.index(self.lookup("x"), "y")), 0, null, "hi", {"abc": Spacebars.call(Spacebars.index(self.lookup("z"), "w")), "z": 123.4}) || ""); });',
      '}');

  run('{{> foo bar baz=x.y}}',

      'function (buf) {',
      '  var self = this;',
      '  buf.component(function () { return ((self.lookup("foo")) || Component).create({"data": Spacebars.call(self.lookup("bar")), "baz": Spacebars.call(Spacebars.index(self.lookup("x"), "y"))}); });',
      '}');

  run('{{#foo.bar}}{{/foo.baz}}', {fail: 'Close tag'});
  run('{{/foo.bar}}{{#foo.bar}}', {fail: 'Unexpected close tag'});

  run('{{#if foo}}bar{{/if}}',

      'function (buf) {',
      '  var self = this;',
      '  buf.component(function () { return ((self.lookup("if")) || Component).create({"data": Spacebars.call(self.lookup("foo")), "content": Component.extend({render: function (buf) {',
      '    buf.text("bar");',
      '  }})}); });',
      '}');

  run('{{#if foo}}bar{{else}}baz{{/if}}',

      'function (buf) {',
      '  var self = this;',
      '  buf.component(function () { return ((self.lookup("if")) || Component).create({"data": Spacebars.call(self.lookup("foo")), "content": Component.extend({render: function (buf) {',
      '    buf.text("bar");',
      '  }}), "elseContent": Component.extend({render: function (buf) {',
      '    buf.text("baz");',
      '  }})}); });',
      '}');
});
