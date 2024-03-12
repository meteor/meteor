import { CssTools } from './minifier';

Tinytest.add(
  'minifier-css - CSS can be parsed properly into an AST',
  (test) => {
    const ast = CssTools.parseCss('body { color: "red"}');
    test.equal(ast.type, 'root');
    test.equal(ast.nodes.length, 1);
    const bodyNode = ast.nodes[0];
    test.equal(bodyNode.type, 'rule');
    test.equal(bodyNode.selector, 'body');
    test.equal(bodyNode.nodes.length, 1);
    const colorNode = bodyNode.nodes[0];
    test.equal(colorNode.type, 'decl');
    test.equal(colorNode.prop, 'color');
    test.equal(colorNode.value, '"red"');
  }
);

Tinytest.add(
  'minifier-css - CSS AST can be converted back into a string',
  (test) => {
    const originalCss = 'body { color: "red"}';
    const cssAst = CssTools.parseCss(originalCss);
    const result = CssTools.stringifyCss(cssAst, { sourcemap: true });
    test.equal(originalCss, result.code);
    test.isNotNull(result.map);
  }
);

Tinytest.addAsync('minifier-css - simple CSS minification', async (test) => {
  const checkMinified =
    async (css, expected, desc) => {
      const minified = await CssTools.minifyCss(css);
      test.equal(minified[0], expected, desc);
    };

  await checkMinified(
    'a \t\n{ color: red } \n',
    'a{color:red}',
    'whitespace check',
  );
  await checkMinified(
    'a \t\n{ color: red; margin: 1; } \n',
    'a{color:red;margin:1}',
    'only last one loses semicolon',
  );
  await checkMinified(
    'a \t\n{ color: red;;; margin: 1;;; } \n',
    'a{color:red;margin:1}',
    'more semicolons than needed',
  );
  await checkMinified(
    'a , p \t\n{ color: red; } \n',
    'a,p{color:red}',
    'multiple selectors',
  );
  await checkMinified(
    'body {}',
    '',
    'removing empty rules',
  );
  await checkMinified(
    '*.my-class { color: #fff; }',
    '.my-class{color:#fff}',
    'removing universal selector',
  );
  await checkMinified(
    'p > *.my-class { color: #fff; }',
    'p>.my-class{color:#fff}',
    'removing optional whitespace around ">" in selector',
  );
  await checkMinified(
    'p +  *.my-class { color: #fff; }',
    'p+.my-class{color:#fff}',
    'removing optional whitespace around "+" in selector',
  );
  await checkMinified(
    'a {\n\
    font:12px \'Helvetica\',"Arial",\'Nautica\';\n\
    background:url("/some/nice/picture.png");\n}',
    'a{background:url(/some/nice/picture.png);font:12px Helvetica,Arial,Nautica}',
    'removing quotes in font and url (if possible)',
  );
  await checkMinified(
    '/* no comments */ a { color: red; }',
    'a{color:red}',
    'remove comments',
  );
});

Tinytest.add(
  "minifier-css - Multiple CSS AST's can be merged into a single CSS AST",
  (test) => {
    const css1 = '@import "custom.css"; body { color: "red"; }';
    const css2 = 'body { color: "blue"; }';
    const cssAst1 = CssTools.parseCss(css1, {from: "test.css"});
    const cssAst2 = CssTools.parseCss(css2, {from: "test2.css"});
    const mergedAst = CssTools.mergeCssAsts([cssAst1, cssAst2]);
    const stringifiedAsts = CssTools.stringifyCss(mergedAst, {
      sourcemap: true,
      inputSourcemaps: false
    });
    test.equal(mergedAst.nodes.length, 3);
    test.equal(stringifiedAsts.map.sources.length, 2);
    test.equal(stringifiedAsts.map.sources[0], 'test.css');
  }
);

Tinytest.add(
  "minifier-css - hoist imports from merged CSS AST's",
  (test) => {
    const css1 = '@import "custom.css"; body { color: "red"; }';
    const css2 = '@import "other.css"; body { color: "blue"; }';
    const cssAst1 = CssTools.parseCss(css1, {from: "test.css"});
    const cssAst2 = CssTools.parseCss(css2, {from: "test2.css"});
    const mergedAst = CssTools.mergeCssAsts([cssAst1, cssAst2]);
    const stringifiedAsts = CssTools.stringifyCss(mergedAst, {
      sourcemap: true,
      inputSourcemaps: false
    });
    test.equal(mergedAst.nodes.length, 4);
    test.equal(mergedAst.nodes[0].name, 'import');
    test.equal(mergedAst.nodes[1].name, 'import');
    test.equal(mergedAst.nodes[2].type, 'rule');
    test.equal(mergedAst.nodes[3].type, 'rule');
    test.equal(stringifiedAsts.map.sources.length, 2);
    test.equal(stringifiedAsts.map.sources[0], 'test.css');
  }
);

Tinytest.add(
  "minifier-css - hoist imports after comments from merged CSS AST's",
  (test) => {
    const css1 = '@import "custom.css"; body { color: "red"; }';
    const css2 = '/* comment */ @import "other.css"; body { color: "blue"; }';
    const cssAst1 = CssTools.parseCss(css1, {from: "test.css"});
    const cssAst2 = CssTools.parseCss(css2, {from: "test2.css"});
    const mergedAst = CssTools.mergeCssAsts([cssAst1, cssAst2]);
    const stringifiedAsts = CssTools.stringifyCss(mergedAst, {
      sourcemap: true,
      inputSourcemaps: false
    });
    test.equal(mergedAst.nodes.length, 5);
    test.equal(mergedAst.nodes[0].name, 'import');
    test.equal(mergedAst.nodes[1].type, 'comment');
    test.equal(mergedAst.nodes[2].name, 'import');
    test.equal(mergedAst.nodes[3].type, 'rule');
    test.equal(mergedAst.nodes[4].type, 'rule');
    test.equal(stringifiedAsts.map.sources.length, 2);
    test.equal(stringifiedAsts.map.sources[0], 'test.css');
  }
);
