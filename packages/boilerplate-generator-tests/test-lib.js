import streamToString from "stream-to-string";

export async function generateHTMLForArch(arch, includeHead) {
  // Use a dummy manifest. None of these paths will be read from the filesystem, but css / js should be handled differently
  const manifest = [
    {
      path: 'packages/bootstrap/css/bootstrap-responsive.css',
      where: 'client',
      type: 'css',
      cacheable: true,
      url: '/packages/bootstrap/css/bootstrap-responsive.css?hash=785760fc5ad665d7b54d56a3c2522797bb2cc150&v="1"',
      size: 22111,
      hash: '785760fc5ad665d7b54d56a3c2522797bb2cc150'
    },
    {
      path: 'packages/templating-runtime.js',
      where: 'client',
      type: 'js',
      cacheable: true,
      url: '/packages/templating-runtime.js?hash=c18de19afda6e9f0db7faf3d4382a4c953cabe18&v="1"',
      size: 24132,
      hash: 'c18de19afda6e9f0db7faf3d4382a4c953cabe18'
    },
  ];

  // Set some extra options for boilerplate data.
  // webapp_server usually constructs a Boilerplate object similarly
  const inline = true;
  const inlineScriptsAllowed = true;
  const additionalStaticJs = [{ contents: 'var a' }];
  const meteorRuntimeConfig = 'config123';
  const rootUrlPathPrefix = 'rootUrlPathPrefix';
  const htmlAttributes = {
    foo: 'foobar',
    gems: '&"',
  };
  const head = includeHead
    ? '<meta name="1" content="">\n<meteor-bundled-css>\n<meta name="2" content="">\n'
    : '';

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
      inline,
      head
    },
  });

  return streamToString(boilerplate.toHTMLStream());
}
