
Tinytest.add("minifiers - url rewriting when merging", function (test) {
  var stylesheet = function(backgroundPath) {
    return "body { color: green; background: top center url(" + backgroundPath + ") black, bottom center url(" + backgroundPath + "); }"
  };

  var filename = 'dir/subdir/style.css';
  var parseOptions = { source: filename, position: true };

  var t = function(relativeUrl, absoluteUrl, desc) {
    var ast1 = CssTools.parseCss(stylesheet(relativeUrl), parseOptions);
    var ast2 = CssTools.parseCss(stylesheet(absoluteUrl), parseOptions);
    CssTools.rewriteCssUrls(ast1);

    test.equal(CssTools.stringifyCss(ast1), CssTools.stringifyCss(ast2), desc);
  };

  t('../image.png', 'dir/image.png', 'parent directory');
  t('./../image.png', 'dir/image.png', 'parent directory');
  t('../subdir2/image.png', 'dir/subdir2/image.png', 'cousin directory');
  t('../../image.png', 'image.png', 'grand parent directory');
  t('./image.png', 'dir/subdir/image.png', 'current directory');
  t('./child/image.png', 'dir/subdir/child/image.png', 'child directory');
  t('child/image.png', 'dir/subdir/child/image.png', 'child directory');
  t('/image.png', '/image.png', 'absolute url');
  t('"/image.png"', '"/image.png"', 'double quoted url');
  t("'/image.png'", "'/image.png'", 'single quoted url');
  t('"./../image.png"', '"dir/image.png"', 'quoted parent directory');
  t('http://i.imgur.com/fBcdJIh.gif', 'http://i.imgur.com/fBcdJIh.gif', 'complete URL');
  t('"http://i.imgur.com/fBcdJIh.gif"', '"http://i.imgur.com/fBcdJIh.gif"', 'complete quoted URL');
  t('data:image/png;base64,iVBORw0K=', 'data:image/png;base64,iVBORw0K=', 'data URI');
  t('http://', 'http://', 'malformed URL');
});
