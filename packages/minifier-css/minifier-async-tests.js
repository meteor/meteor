import { CssTools } from './minifier';
const TEST_CASES = [
  ['a \t\n{ color: red } \n', 'a{color:red}', 'whitespace check'],
  [
    'a \t\n{ color: red; margin: 1; } \n',
    'a{color:red;margin:1}',
    'only last one loses semicolon',
  ],
  [
    'a \t\n{ color: red;;; margin: 1;;; } \n',
    'a{color:red;margin:1}',
    'more semicolons than needed',
  ],
  ['a , p \t\n{ color: red; } \n', 'a,p{color:red}', 'multiple selectors'],
  ['body {}', '', 'removing empty rules'],
  [
    '*.my-class { color: #fff; }',
    '.my-class{color:#fff}',
    'removing universal selector',
  ],
  [
    'p > *.my-class { color: #fff; }',
    'p>.my-class{color:#fff}',
    'removing optional whitespace around ">" in selector',
  ],
  [
    'p +  *.my-class { color: #fff; }',
    'p+.my-class{color:#fff}',
    'removing optional whitespace around "+" in selector',
  ],
  [
    'a {\n\
  font:12px \'Helvetica\',"Arial",\'Nautica\';\n\
  background:url("/some/nice/picture.png");\n}',
    'a{background:url(/some/nice/picture.png);font:12px Helvetica,Arial,Nautica}',
    'removing quotes in font and url (if possible)',
  ],
  ['/* no comments */ a { color: red; }', 'a{color:red}', 'remove comments'],
];

Tinytest.addAsync(
  '[Async] minifier-css - simple CSS minification',
  async (test) => {
    const promises = TEST_CASES.map(([css, expected, desc]) =>
      CssTools.minifyCssAsync(css).then((minifiedCss) => {
        test.equal(minifiedCss[0], expected, desc);
      })
    );
    return Promise.all(promises);
  }
);
