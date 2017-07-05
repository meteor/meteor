import { parse, serialize } from 'parse5';

function generateHTML() {
  const arch = 'web.cordova';

  // Use a dummy manifest. None of these paths will be read from the filesystem, but css / js should be handled differently
  const manifest = [
    { path: 'packages/bootstrap/css/bootstrap-responsive.css',
      where: 'client',
      type: 'css',
      cacheable: true,
      url: '/packages/bootstrap/css/bootstrap-responsive.css?hash=785760fc5ad665d7b54d56a3c2522797bb2cc150&v="1"',
      size: 22111,
      hash: '785760fc5ad665d7b54d56a3c2522797bb2cc150' },
   { path: 'packages/templating-runtime.js',
     where: 'client',
     type: 'js',
     cacheable: true,
     url: '/packages/templating-runtime.js?hash=c18de19afda6e9f0db7faf3d4382a4c953cabe18&v="1"',
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
  const htmlAttributes = {
    foo: 'foobar',
    gems: '&"',
  };

  // A dummy rewrite hook to test ampersands
  function bundledJsCssUrlRewriteHook(url) {
    return url + '+rewritten_url=true';
  }

  const boilerplate = new Boilerplate(arch, manifest, {
    baseDataExtension: {
      htmlAttributes,
      additionalStaticJs,
      meteorRuntimeConfig,
      rootUrlPathPrefix,
      bundledJsCssUrlRewriteHook,
      inlineScriptsAllowed,
      inline
    },
  });

  return boilerplate.toHTML();
}

Tinytest.add("boilerplate-generator-tests - web.cordova well-formed html", function (test) {
  const html = generateHTML();
  const formatted = serialize(parse(html));
  test.isTrue(formatted.replace(/\s/g, '') === html.replace(/\s/g, ''));
});

Tinytest.add("boilerplate-generator-tests - web.cordova include js", function (test) {
  const html = generateHTML();
  test.matches(html, /<script.*src=".*templating.*">/);
});

Tinytest.add("boilerplate-generator-tests - web.cordova escape js", function (test) {
  const html = generateHTML();
  test.matches(html, /<script.*src=".*templating.*&amp;v=&quot;1&quot;.*">/);
});

Tinytest.add("boilerplate-generator-tests - web.cordova include css", function (test) {
  const html = generateHTML();
  test.matches(html, /<link.*href=".*bootstrap.*">/);
});

Tinytest.add("boilerplate-generator-tests - web.cordova escape css", function (test) {
  const html = generateHTML();
  test.matches(html, /<link.*href=".*bootstrap.*&amp;v=&quot;1&quot;.*">/);
});

Tinytest.add("boilerplate-generator-tests - web.cordova do not call rewriteHook", function (test) {
  const html = generateHTML();
  test.notMatches(html, /\+rewritten_url=true/);
});

Tinytest.add("boilerplate-generator-tests - web.cordova include runtime config", function (test) {
  const html = generateHTML();
  test.matches(html, /<script.*>.*\n.*__meteor_runtime_config__ =.*decodeURIComponent\(config123\)\)/);
});
