Tinytest.add("minifiers - CSS pull the imports to the top", function (test) {
  function t(source, expected, descr) {
    var processed = CleanCSSProcess(source);
    test.equal(processed, expected, descr);
  }

  t(["@import url(//fonts.googleapis.com/css?family=Tangerine);",
     ".block1{font-family:Tangerine}",
     "@import url('//fonts.googleapis.com/css?family=Oleo Script Swash Caps');",
     ".block2{font-family:'Oleo Script Swash Caps'}"].join('\n'),
    ["@import url(//fonts.googleapis.com/css?family=Tangerine);",
     "@import url('//fonts.googleapis.com/css?family=Oleo Script Swash Caps');",
     ".block1{font-family:Tangerine}",
     ".block2{font-family:'Oleo Script Swash Caps'}"].join(''), "just imports");
  t(["@import url(//fonts.googleapis.com/css?family=Tangerine),",
     "        url('//fonts.googleapis.com/css?family=Oleo Script Swash Caps');",
     ".block2{font-family:'Oleo Script Swash Caps'}"].join('\n'),
    ["@import url(//fonts.googleapis.com/css?family=Tangerine),",
     "url('//fonts.googleapis.com/css?family=Oleo Script Swash Caps');",
     ".block2{font-family:'Oleo Script Swash Caps'}"].join(''), "multiline @imports");
  t([".block2{font-family:'Oleo Script Swash Caps'}",
     "div[x='@import asdf;']{font:#000}"].join('\n'),
    [".block2{font-family:'Oleo Script Swash Caps'}",
     "div[x='@import asdf;']{font:#000}"].join(''), "@import embeded as string");
});

