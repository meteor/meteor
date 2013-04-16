Tinytest.add("html5-tokenizer - basic", function (test) {

  test.equal(HTML5Tokenizer.tokenize('<p>foo'),
             [ { type: 'StartTag', name: 'p', data: [] },
               { type: 'Characters', data: 'foo' },
               { type: 'EOF', data: 'End of File' } ]);

});