import { parse, serialize } from 'parse5';

function wellFormedHTML(html) {
  const formatted = serialize(parse(html));
  return formatted.replace(/\s/g, '') === html.replace(/\s/g, '')
}

Tinytest.add("boilerplate-generator-tests - browser html", function (test) {
  const arch = 'web.browser';

  // Use a dummy manifest. None of these paths will be read from the filesystem, but css / js should be handled differently
  const manifest = [
    { path: 'packages/bootstrap/css/bootstrap-responsive.css',
      where: 'client',
      type: 'css',
      cacheable: true,
      url: '/packages/bootstrap/css/bootstrap-responsive.css?hash=785760fc5ad665d7b54d56a3c2522797bb2cc150',
      size: 22111,
      hash: '785760fc5ad665d7b54d56a3c2522797bb2cc150' },
   { path: 'packages/templating-runtime.js',
     where: 'client',
     type: 'js',
     cacheable: true,
     url: '/packages/templating-runtime.js?hash=c18de19afda6e9f0db7faf3d4382a4c953cabe18',
     size: 24132,
     hash: 'c18de19afda6e9f0db7faf3d4382a4c953cabe18' },
  ];

  // Set some extra options for boilerplate data.
  // webapp_server usually constructs a Boilerplate object similarly
  const inline = true;
  const inlineScriptsAllowed = true;
  const additionalStaticJs = [];
  const meteorRuntimeConfig = 'config123';
  const rootUrlPathPrefix = 'rootUrlPathPrefix';

  // A dummy rewrite hook to test ampersands
  function bundledJsCssUrlRewriteHook(url) {
    return url + '&rewritten_url=true';
  }

  const boilerplate = new Boilerplate(arch, manifest, {
    baseDataExtension: {
      additionalStaticJs,
      meteorRuntimeConfig,
      rootUrlPathPrefix,
      bundledJsCssUrlRewriteHook,
      inlineScriptsAllowed,
      inline
    },
  });

  const html = boilerplate.toHTML();
  // Must call rewrite hook
  // Must avoid ambiguous ampersands
  test.matches(html, /&amp;rewritten_url=true/);
  // Must include the runtime config
  test.matches(html, /<script.*>.*__meteor_runtime_config__ =.*decodeURIComponent\(config123\)/);
  // Must load js correctly
  test.matches(html, /<script.* src=\"\/packages\/templating-runtime\.js\?hash=c18de1.*\">/);
  // Must load css correctly
  test.matches(html, /<link.* rel=\"stylesheet\".* href=\"\/packages\/bootstrap\/.*hash=785760.*\">/);
  // Must be valid html
  test.isTrue(wellFormedHTML(html), 'boilerplate is well formed');
});
