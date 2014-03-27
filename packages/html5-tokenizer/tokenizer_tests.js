Tinytest.add("html5-tokenizer - basic", function (test) {

  var run = function (input, expectedTokens) {
    test.equal(HTML5Tokenizer.tokenize(input),
               expectedTokens);
  };

  run('<p>foo',
      [ { type: 'StartTag', name: 'p', data: [] },
        { type: 'Characters', data: 'foo' },
        { type: 'EOF', data: 'End of File' } ]);

  run('<!DOCTYPE html>',
      [ { type: 'Doctype', name: 'html', correct: true,
          publicId: null, systemId: null },
        { type: 'EOF', data: 'End of File' } ]);

  run('<a b c=d> </a>',
      [ { type: 'StartTag', name: 'a',
          data: [{nodeName: 'b', nodeValue: ''},
                 {nodeName: 'c', nodeValue: 'd'}] },
        { type: 'SpaceCharacters', data: ' ' },
        { type: 'EndTag', name: 'a', data: [] },
        { type: 'EOF', data: 'End of File' } ]);

  run('<3',
      [{ type: 'ParseError', data: 'expected-tag-name' },
       { type: 'Characters', data: '<' },
       { type: 'Characters', data: '3' },
       { type: 'EOF', data: 'End of File' } ]);

  run('<!--foo-->',
      [{ type: 'Comment', data: 'foo' },
       { type: 'EOF', data: 'End of File' } ]);

});