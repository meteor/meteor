import { CssTools } from './minifier';

Tinytest.add('minifier-css - url rewriting when merging', (test) => {
  const stylesheet = backgroundPath => (
    `body { color: green; background: top center url(${backgroundPath}) black, bottom center url(${backgroundPath}); }`
  );

  const parseOptions = { from: null, position: true };

  const t = (relativeUrl, absoluteUrl, desc) => {
    const ast1 = CssTools.parseCss(stylesheet(relativeUrl), parseOptions);
    const ast2 = CssTools.parseCss(stylesheet(absoluteUrl), parseOptions);
    CssTools.rewriteCssUrls(ast1);
    test.equal(CssTools.stringifyCss(ast1), CssTools.stringifyCss(ast2), desc);
  };

  parseOptions.from = 'packages/nameOfPackage/style.css';
  t('../image.png', 'packages/image.png', 'parent directory');
  t('./../image.png', 'packages/image.png', 'parent directory');
  t('../nameOfPackage2/image.png', 'packages/nameOfPackage2/image.png', 'cousin directory');
  t('../../image.png', 'image.png', 'grand parent directory');
  t('./image.png', 'packages/nameOfPackage/image.png', 'current directory');
  t('./child/image.png', 'packages/nameOfPackage/child/image.png', 'child directory');
  t('child/image.png', 'packages/nameOfPackage/child/image.png', 'child directory');
  t('/image.png', 'image.png', 'absolute url');
  t('"/image.png"', '"image.png"', 'double quoted url');
  t("'/image.png'", "'image.png'", 'single quoted url');
  t('"./../image.png"', '"packages/image.png"', 'quoted parent directory');
  t('http://i.imgur.com/fBcdJIh.gif', 'http://i.imgur.com/fBcdJIh.gif', 'complete URL');
  t('"http://i.imgur.com/fBcdJIh.gif"', '"http://i.imgur.com/fBcdJIh.gif"', 'complete quoted URL');
  t('data:image/png;base64,iVBORw0K=', 'data:image/png;base64,iVBORw0K=', 'data URI');
  t('http://', 'http://', 'malformed URL');

  parseOptions.from = 'application/client/dir/other-style.css';
  t('./image.png', 'image.png', 'base path is root');
  t('./child/image.png', 'child/image.png', 'child directory from root');
  t('child/image.png', 'child/image.png', 'child directory from root');
  t('/image.png', 'image.png', 'absolute url');
  t('"/image.png"', '"image.png"', 'double quoted url');
  t("'/image.png'", "'image.png'", 'single quoted url');
  t('http://i.imgur.com/fBcdJIh.gif', 'http://i.imgur.com/fBcdJIh.gif', 'complete URL');
  t('"http://i.imgur.com/fBcdJIh.gif"', '"http://i.imgur.com/fBcdJIh.gif"', 'complete quoted URL');
  t('data:image/png;base64,iVBORw0K=', 'data:image/png;base64,iVBORw0K=', 'data URI');
  t('http://', 'http://', 'malformed URL');
});

Tinytest.add('minifier-css - url rewriting with media queries (ast rule recursion)', (test) => {
  const stylesheet = backgroundPath => (
    `@media (min--moz-device-pixel-ratio: 1.5),\n\
    (-o-min-device-pixel-ratio: 3/2),\n\
    (-webkit-min-device-pixel-ratio: 1.5),\n\
    (min-device-pixel-ratio: 1.5),\n\
    (min-resolution: 1.5dppx) \n\
    { .foobar { background-image: url(${backgroundPath}); } }`
  );

  const parseOptions = { from: null, position: true };

  const t = (relativeUrl, absoluteUrl, desc) => {
    const ast1 = CssTools.parseCss(stylesheet(relativeUrl), parseOptions);
    const ast2 = CssTools.parseCss(stylesheet(absoluteUrl), parseOptions);
    CssTools.rewriteCssUrls(ast1);
    test.equal(CssTools.stringifyCss(ast1), CssTools.stringifyCss(ast2), desc);
  };

  parseOptions.from = 'packages/nameOfPackage/style.css';
  t('../image.png', 'packages/image.png', 'parent directory');
  t('./../image.png', 'packages/image.png', 'parent directory');
  t('../nameOfPackage2/image.png', 'packages/nameOfPackage2/image.png', 'cousin directory');
  t('../../image.png', 'image.png', 'grand parent directory');
  t('./image.png', 'packages/nameOfPackage/image.png', 'current directory');
  t('./child/image.png', 'packages/nameOfPackage/child/image.png', 'child directory');
  t('child/image.png', 'packages/nameOfPackage/child/image.png', 'child directory');
  t('/image.png', 'image.png', 'absolute url');
  t('"/image.png"', '"image.png"', 'double quoted url');
  t("'/image.png'", "'image.png'", 'single quoted url');
  t('"./../image.png"', '"packages/image.png"', 'quoted parent directory');
  t('http://i.imgur.com/fBcdJIh.gif', 'http://i.imgur.com/fBcdJIh.gif', 'complete URL');
  t('//i.imgur.com/fBcdJIh.gif', '//i.imgur.com/fBcdJIh.gif', 'network-path reference');
  t('"http://i.imgur.com/fBcdJIh.gif"', '"http://i.imgur.com/fBcdJIh.gif"', 'complete quoted URL');
  t('data:image/png;base64,iVBORw0K=', 'data:image/png;base64,iVBORw0K=', 'data URI');
  t('http://', 'http://', 'malformed URL');

  parseOptions.from = 'application/client/dir/other-style.css';
  t('./image.png', 'image.png', 'base path is root');
  t('./child/image.png', 'child/image.png', 'child directory from root');
  t('child/image.png', 'child/image.png', 'child directory from root');
  t('/image.png', 'image.png', 'absolute url');
  t('"/image.png"', '"image.png"', 'double quoted url');
  t("'/image.png'", "'image.png'", 'single quoted url');
  t('http://i.imgur.com/fBcdJIh.gif', 'http://i.imgur.com/fBcdJIh.gif', 'complete URL');
  t('//i.imgur.com/fBcdJIh.gif', '//i.imgur.com/fBcdJIh.gif', 'network-path reference');
  t('"http://i.imgur.com/fBcdJIh.gif"', '"http://i.imgur.com/fBcdJIh.gif"', 'complete quoted URL');
  t('data:image/png;base64,iVBORw0K=', 'data:image/png;base64,iVBORw0K=', 'data URI');
  t('http://', 'http://', 'malformed URL');

});

Tinytest.add('minifier-css - url rewriting with hash symbols', (test) => {
  const stylesheet = backgroundPath => (
    `body { background-image: url(${backgroundPath})}`
  );

  const parseOptions = { from: null, position: true };

  const t = (relativeUrl, absoluteUrl, desc) => {
    const ast1 = CssTools.parseCss(stylesheet(relativeUrl), parseOptions);
    const ast2 = CssTools.parseCss(stylesheet(absoluteUrl), parseOptions);
    CssTools.rewriteCssUrls(ast1);
    test.equal(CssTools.stringifyCss(ast1), CssTools.stringifyCss(ast2), desc);
  };

  parseOptions.from = 'packages/nameOfPackage/style.css';
  t('../filters.svg#theFilterId', 'packages/filters.svg#theFilterId', 'parent directory');
  t('./../filters.svg#theFilterId', 'packages/filters.svg#theFilterId', 'parent directory');
  t('../nameOfPackage2/filters.svg#theFilterId', 'packages/nameOfPackage2/filters.svg#theFilterId', 'cousin directory');
  t('../../filters.svg#theFilterId', 'filters.svg#theFilterId', 'grand parent directory');
  t('./filters.svg#theFilterId', 'packages/nameOfPackage/filters.svg#theFilterId', 'current directory');
  t('./child/filters.svg#theFilterId', 'packages/nameOfPackage/child/filters.svg#theFilterId', 'child directory');
  t('child/filters.svg#theFilterId', 'packages/nameOfPackage/child/filters.svg#theFilterId', 'child directory');
  t('/filters.svg#theFilterId', 'filters.svg#theFilterId', 'absolute url');
  t('"/filters.svg#theFilterId"', '"filters.svg#theFilterId"', 'double quoted url');
  t("'/filters.svg#theFilterId'", "'filters.svg#theFilterId'", 'single quoted url');
  t('"./../filters.svg#theFilterId"', '"packages/filters.svg#theFilterId"', 'quoted parent directory');
  t('http://i.imgur.com/filters.svg#theFilterId', 'http://i.imgur.com/filters.svg#theFilterId', 'complete URL');
  t('"http://i.imgur.com/filters.svg#theFilterId"', '"http://i.imgur.com/filters.svg#theFilterId"', 'complete quoted URL');
  t('data:image/png;base64,iVBORw0K=#theFilterId', 'data:image/png;base64,iVBORw0K=#theFilterId', 'data URI');
  t('http://', 'http://', 'malformed URL');
  t('#theFilterId', '#theFilterId', 'URL starting with a #');

  parseOptions.from = 'application/client/dir/other-style.css';
  t('./filters.svg#theFilterId', 'filters.svg#theFilterId', 'base path is root');
  t('./child/filters.svg#theFilterId', 'child/filters.svg#theFilterId', 'child directory from root');
  t('child/filters.svg#theFilterId', 'child/filters.svg#theFilterId', 'child directory from root');
  t('/filters.svg#theFilterId', 'filters.svg#theFilterId', 'absolute url');
  t('"/filters.svg#theFilterId"', '"filters.svg#theFilterId"', 'double quoted url');
  t("'/filters.svg#theFilterId'", "'filters.svg#theFilterId'", 'single quoted url');
  t('http://i.imgur.com/filters.svg#theFilterId', 'http://i.imgur.com/filters.svg#theFilterId', 'complete URL');
  t('"http://i.imgur.com/filters.svg#theFilterId"', '"http://i.imgur.com/filters.svg#theFilterId"', 'complete quoted URL');
  t('data:image/png;base64,iVBORw0K=#theFilterId', 'data:image/png;base64,iVBORw0K=#theFilterId', 'data URI');
  t('http://', 'http://', 'malformed URL');
  t('#theFilterId', '#theFilterId', 'URL starting with a #');

});
