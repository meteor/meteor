Tinytest.add("minifiers - simple css minification", function (test) {
  var t = function (css, expected, desc) {
    test.equal(CssTools.minifyCss(css), expected, desc);
  }

  t('a \t\n{ color: red } \n', 'a{color:red}', 'whitespace check');
  t('a \t\n{ color: red; margin: 1; } \n', 'a{color:red;margin:1}', 'only last one loses semicolon');
  t('a \t\n{ color: red;;; margin: 1;;; } \n', 'a{color:red;margin:1}', 'more semicolons than needed');
  t('a , p \t\n{ color: red; } \n', 'a,p{color:red}', 'multiple selectors');
  t('body {}', '', 'removing empty rules');
  t('*.my-class { color: #fff; }', '.my-class{color:#fff}', 'removing universal selector');
  t('p > *.my-class { color: #fff; }', 'p>.my-class{color:#fff}', 'removing optional whitespace around ">" in selector');
  t('p +  *.my-class { color: #fff; }', 'p+.my-class{color:#fff}', 'removing optional whitespace around "+" in selector');
  // XXX url parsing is difficult to support at the moment
  t('a {\n\
  font:12px \'Helvetica\',"Arial",\'Nautica\';\n\
  background:url("/some/nice/picture.png");\n}',
  'a{font:12px Helvetica,Arial,Nautica;background:url("/some/nice/picture.png")}',  'removing quotes in font and url (if possible)');
  t('/* no comments */ a { color: red; }', 'a{color:red}', 'remove comments');
});

