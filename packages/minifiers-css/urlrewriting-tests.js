
Tinytest.add("minifiers - url rewriting when merging", function (test) {
  var stylesheet = function(backgroundPath) {
    return "body { color: green; background: top center url(" + backgroundPath + ") black, bottom center url(" + backgroundPath + "); }"
  };

  var parseOptions = { source: null, position: true };

  var t = function(relativeUrl, absoluteUrl, desc) {
    var ast1 = CssTools.parseCss(stylesheet(relativeUrl), parseOptions);
    var ast2 = CssTools.parseCss(stylesheet(absoluteUrl), parseOptions);
    CssTools.rewriteCssUrls(ast1);

    test.equal(CssTools.stringifyCss(ast1), CssTools.stringifyCss(ast2), desc);
  };

  parseOptions.source = 'packages/nameOfPackage/style.css';
  t('../image.png', 'packages/image.png', 'parent directory');
  t('./../image.png', 'packages/image.png', 'parent directory');
  t('../nameOfPackage2/image.png', 'packages/nameOfPackage2/image.png', 'cousin directory');
  t('../../image.png', 'image.png', 'grand parent directory');
  t('./image.png', 'packages/nameOfPackage/image.png', 'current directory');
  t('./child/image.png', 'packages/nameOfPackage/child/image.png', 'child directory');
  t('child/image.png', 'packages/nameOfPackage/child/image.png', 'child directory');
  t('/image.png', '/image.png', 'absolute url');
  t('"/image.png"', '"/image.png"', 'double quoted url');
  t("'/image.png'", "'/image.png'", 'single quoted url');
  t('"./../image.png"', '"packages/image.png"', 'quoted parent directory');
  t('http://i.imgur.com/fBcdJIh.gif', 'http://i.imgur.com/fBcdJIh.gif', 'complete URL');
  t('"http://i.imgur.com/fBcdJIh.gif"', '"http://i.imgur.com/fBcdJIh.gif"', 'complete quoted URL');
  t('data:image/png;base64,iVBORw0K=', 'data:image/png;base64,iVBORw0K=', 'data URI');
  t('http://', 'http://', 'malformed URL');

  parseOptions.source = 'application/client/dir/other-style.css';
  t('./image.png', '/image.png', 'base path is root');
  t('./child/image.png', '/child/image.png', 'child directory from root');
  t('child/image.png', '/child/image.png', 'child directory from root');
  t('/image.png', '/image.png', 'absolute url');
  t('"/image.png"', '"/image.png"', 'double quoted url');
  t("'/image.png'", "'/image.png'", 'single quoted url');
  t('http://i.imgur.com/fBcdJIh.gif', 'http://i.imgur.com/fBcdJIh.gif', 'complete URL');
  t('"http://i.imgur.com/fBcdJIh.gif"', '"http://i.imgur.com/fBcdJIh.gif"', 'complete quoted URL');
  t('data:image/png;base64,iVBORw0K=', 'data:image/png;base64,iVBORw0K=', 'data URI');
  t('http://', 'http://', 'malformed URL');

});

Tinytest.add("minifiers - url rewriting with media queries (ast rule recursion)", function (test) {
  var stylesheet = function(backgroundPath) {
    return "@media (min--moz-device-pixel-ratio: 1.5),\n\
    (-o-min-device-pixel-ratio: 3/2),\n\
    (-webkit-min-device-pixel-ratio: 1.5),\n\
    (min-device-pixel-ratio: 1.5),\n\
    (min-resolution: 1.5dppx) \n\
    { .foobar { background-image: url(" + backgroundPath + "); } }"
  };

  var parseOptions = { source: null, position: true };

  var t = function(relativeUrl, absoluteUrl, desc) {
    var ast1 = CssTools.parseCss(stylesheet(relativeUrl), parseOptions);
    var ast2 = CssTools.parseCss(stylesheet(absoluteUrl), parseOptions);
    CssTools.rewriteCssUrls(ast1);

    test.equal(CssTools.stringifyCss(ast1), CssTools.stringifyCss(ast2), desc);
  };

  parseOptions.source = 'packages/nameOfPackage/style.css';
  t('../image.png', 'packages/image.png', 'parent directory');
  t('./../image.png', 'packages/image.png', 'parent directory');
  t('../nameOfPackage2/image.png', 'packages/nameOfPackage2/image.png', 'cousin directory');
  t('../../image.png', 'image.png', 'grand parent directory');
  t('./image.png', 'packages/nameOfPackage/image.png', 'current directory');
  t('./child/image.png', 'packages/nameOfPackage/child/image.png', 'child directory');
  t('child/image.png', 'packages/nameOfPackage/child/image.png', 'child directory');
  t('/image.png', '/image.png', 'absolute url');
  t('"/image.png"', '"/image.png"', 'double quoted url');
  t("'/image.png'", "'/image.png'", 'single quoted url');
  t('"./../image.png"', '"packages/image.png"', 'quoted parent directory');
  t('http://i.imgur.com/fBcdJIh.gif', 'http://i.imgur.com/fBcdJIh.gif', 'complete URL');
  t('"http://i.imgur.com/fBcdJIh.gif"', '"http://i.imgur.com/fBcdJIh.gif"', 'complete quoted URL');
  t('data:image/png;base64,iVBORw0K=', 'data:image/png;base64,iVBORw0K=', 'data URI');
  t('http://', 'http://', 'malformed URL');

  parseOptions.source = 'application/client/dir/other-style.css';
  t('./image.png', '/image.png', 'base path is root');
  t('./child/image.png', '/child/image.png', 'child directory from root');
  t('child/image.png', '/child/image.png', 'child directory from root');
  t('/image.png', '/image.png', 'absolute url');
  t('"/image.png"', '"/image.png"', 'double quoted url');
  t("'/image.png'", "'/image.png'", 'single quoted url');
  t('http://i.imgur.com/fBcdJIh.gif', 'http://i.imgur.com/fBcdJIh.gif', 'complete URL');
  t('"http://i.imgur.com/fBcdJIh.gif"', '"http://i.imgur.com/fBcdJIh.gif"', 'complete quoted URL');
  t('data:image/png;base64,iVBORw0K=', 'data:image/png;base64,iVBORw0K=', 'data URI');
  t('http://', 'http://', 'malformed URL');

});
