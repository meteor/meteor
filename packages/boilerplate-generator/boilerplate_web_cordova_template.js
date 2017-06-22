// Template function for rendering the boilerplate html for cordova
// Replicates the template defined in boilerplate_web.cordova.html
// Arguments: root : { htmlAttributes, css : [{ url }], bundledJsCssUrlRewriteHook : Function, head, dynamicHead, body, dynamicBody, inlineScriptsAllowed, additionalStaticJs, meteorRuntimeConfig }

export default function(manifest) {
  const root = manifest;
  // XXX do we need to do some validation on the properties of root?
  return [].concat(
    [
      '<html>',
      '<head>',
      '  <meta charset="utf-8">',
      '  <meta name="format-detection" content="telephone=no">',
      '  <meta name="viewport" content="user-scalable=no, initial-scale=1, maximum-scale=1, minimum-scale=1, width=device-width, height=device-height">',
      '  <meta name="msapplication-tap-highlight" content="no">',
      '  <meta http-equiv="Content-Security-Policy" content="default-src * gap: data: blob: \'unsafe-inline\' \'unsafe-eval\' ws: wss:;">',
    ],
    // We are explicitly not using bundledJsCssUrlRewriteHook: in cordova we serve assets up directly from disk, so rewriting the URL does not make sense
    _.map(root.css, ({url}) =>
      _.template('  <link rel="stylesheet" type="text/css" class="__meteor-css__" href="<%- href %>">')({
        href: url
      })
    ),
    [
      '  <script type="text/javascript">',
      _.template('    __meteor_runtime_config__ = JSON.parse(decodeURIComponent(<%= conf %>));')({
        conf: root.meteorRuntimeConfig
      }),
      '    if (/Android/i.test(navigator.userAgent)) {',
      // When Android app is emulated, it cannot connect to localhost,
      // instead it should connect to 10.0.2.2
      // (unless we\'re using an http proxy; then it works!)
      '      if (!__meteor_runtime_config__.httpProxyPort) {',
      '        __meteor_runtime_config__.ROOT_URL = (__meteor_runtime_config__.ROOT_URL || \'\').replace(/localhost/i, \'10.0.2.2\');',
      '        __meteor_runtime_config__.DDP_DEFAULT_CONNECTION_URL = (__meteor_runtime_config__.DDP_DEFAULT_CONNECTION_URL || \'\').replace(/localhost/i, \'10.0.2.2\');',
      '      }',
      '    }',
      '  </script>',
      '',
      '  <script type="text/javascript" src="/cordova.js"></script>'
    ],
    _.map(root.js, ({url}) =>
      _.template('  <script type="text/javascript" src="<%- src %>"></script>')({
        src: url
      })
    ),
    _.map(root.additionalStaticJs, ({pathname, contents}) =>
      _.template(inlineScriptsAllowed
        ? '  <script type="text/javascript"><%= contents %></script>'
        : '  <script type="text/javascript" src="<%- src %>"></script>'
      )({
        src: root.rootUrlPathPrefix + pathname,
        contents: contents
      })
    ),
    [
      '',
      root.head,
      '</head>',
      '',
      '<body>',
      root.body,
      '</body>',
      '</html>'
    ],

    ['', '<!-- Generated for cordova by boilerplate-generator -->']
  ).join('\n');
}

