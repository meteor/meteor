import template from './template';

// Template function for rendering the boilerplate html for a Tauri native app.
//
// This mirrors template-web.cordova.js: the client bundle is served directly
// off disk by the native local server (the Rust meteor-webapp plugin) using the
// `meteor://` URI scheme, so asset URLs are used as-is without the
// bundledJsCssUrlRewriteHook. Unlike Cordova there is no `cordova.js` shim and
// no Android-emulator localhost rewrite (Tauri injects the correct dev host).
export const headTemplate = ({
  meteorRuntimeConfig,
  rootUrlPathPrefix,
  inlineScriptsAllowed,
  css,
  js,
  additionalStaticJs,
  htmlAttributes,
  bundledJsCssUrlRewriteHook,
  head,
  dynamicHead,
}) => {
  var headSections = head.split(/<meteor-bundled-css[^<>]*>/, 2);
  var cssBundle = [
    // Assets are served directly from disk by the native local server, so we
    // do not rewrite the URLs.
    ...(css || []).map(file =>
      template('  <link rel="stylesheet" type="text/css" class="__meteor-css__" href="<%- href %>">')({
        href: file.url,
      })
  )].join('\n');

  return [
    '<html>',
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="format-detection" content="telephone=no">',
    '  <meta name="viewport" content="user-scalable=no, initial-scale=1, maximum-scale=1, minimum-scale=1, width=device-width, height=device-height, viewport-fit=cover">',
    '  <meta name="msapplication-tap-highlight" content="no">',
    '  <meta http-equiv="Content-Security-Policy" content="default-src * meteor: tauri: ipc: asset: data: blob: \'unsafe-inline\' \'unsafe-eval\' ws: wss:;">',

  (headSections.length === 1)
    ? [cssBundle, headSections[0]].join('\n')
    : [headSections[0], cssBundle, headSections[1]].join('\n'),

    '  <script type="text/javascript">',
    template('    __meteor_runtime_config__ = JSON.parse(decodeURIComponent(<%= conf %>));')({
      conf: meteorRuntimeConfig,
    }),
    '  </script>',
    '',

    ...(js || []).map(file =>
      template('  <script type="text/javascript" src="<%- src %>"></script>')({
        src: file.url,
      })
    ),

    ...(additionalStaticJs || []).map(({ contents, pathname }) => (
      inlineScriptsAllowed
        ? template('  <script><%= contents %></script>')({
          contents,
        })
        : template('  <script type="text/javascript" src="<%- src %>"></script>')({
          src: rootUrlPathPrefix + pathname
        })
    )),
    '',
    '</head>',
    '',
    '<body>',
  ].join('\n');
};

export function closeTemplate() {
  return "</body>\n</html>";
}
