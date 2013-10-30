Tinytest.add("ui - render2", function (test) {
  var run = function (input, expectedInnerHTML, expectedHTML, expectedCode) {
    var div = document.createElement("DIV");
    UI.materialize(input, div);
    test.equal(canonicalizeHtml(div.innerHTML), expectedInnerHTML);
    test.equal(UI.toHTML(input), expectedHTML);
    test.equal(UI.toCode(input), expectedCode);
  };

  var P = UI.Tag.P;
  var CharRef = UI.Tag.CharRef;
  var DIV = UI.Tag.DIV;
  var Comment = UI.Tag.Comment;

  run(P('Hello'),
      '<p>Hello</p>',
      '<p>Hello</p>',
      'UI.Tag.P("Hello")');

  // Test crazy character references

  // `&zopf;` is "Mathematical double-struck small z" a.k.a. "open-face z"
  run(P(CharRef({html: '&zopf;', str: '\ud835\udd6b'})),
      '<p>\ud835\udd6b</p>',
      '<p>&zopf;</p>',
      'UI.Tag.P(UI.Tag.CharRef({html: "&zopf;", str: "\\ud835\\udd6b"}))');

  run(P({id: CharRef({html: '&zopf;', str: '\ud835\udd6b'})}, 'Hello'),
      '<p id="\ud835\udd6b">Hello</p>',
      '<p id="&zopf;">Hello</p>',
      'UI.Tag.P({id: UI.Tag.CharRef({html: "&zopf;", str: "\\ud835\\udd6b"})}, "Hello")');

  run(P({id: [CharRef({html: '&zopf;', str: '\ud835\udd6b'}), '!']}, 'Hello'),
      '<p id="\ud835\udd6b!">Hello</p>',
      '<p id="&zopf;!">Hello</p>',
      'UI.Tag.P({id: [UI.Tag.CharRef({html: "&zopf;", str: "\\ud835\\udd6b"}), "!"]}, "Hello")');

   // Test comments

  run(DIV(Comment('Test')),
      '<div><!----></div>', // our innerHTML-canonicalization function kills comment contents
      '<div><!--Test--></div>',
      'UI.Tag.DIV(UI.Tag.Comment("Test"))');

});
