// Template function for rendering the boilerplate html for browsers

export default function({
  meteorRuntimeConfig,
  rootUrlPathPrefix,
  inlineScriptsAllowed,
  css,
  js,
  additionalStaticJs,
  htmlAttributes,
  bundledJsCssUrlRewriteHook,
  head,
  body,
  dynamicHead,
  dynamicBody,
}) {
  return [].concat(
    [
      '<html' +_.map(htmlAttributes, (value, key) =>
        _.template(' <%= attrName %>="<%- attrValue %>"')({
          attrName: key,
          attrValue: value
        })
      ).join('') + '>',
      '<head>'
    ],

    _.map(css, ({url}) =>
      _.template('  <link rel="stylesheet" type="text/css" class="__meteor-css__" href="<%- href %>">')({
        href: bundledJsCssUrlRewriteHook(url)
      })
    ),

    [
      head,
      dynamicHead,
      '</head>',
      '<body>',
      body,
      dynamicBody,
      '',
      (inlineScriptsAllowed
        ? _.template('  <script type="text/javascript">__meteor_runtime_config__ = JSON.parse(decodeURIComponent(<%= conf %>))</script>')({
          conf: meteorRuntimeConfig
        })
        : _.template('  <script type="text/javascript" src="<%- src %>/meteor_runtime_config.js"></script>')({
          src: rootUrlPathPrefix
        })
      ) ,
      ''
    ],

    _.map(js, ({url}) =>
      _.template('  <script type="text/javascript" src="<%- src %>"></script>')({
        src: bundledJsCssUrlRewriteHook(url)
      })
    ),

    _.map(additionalStaticJs, ({contents, pathname}) => (
      (inlineScriptsAllowed
        ? _.template('  <script><%= contents %></script>')({
          contents: contents
        })
        : _.template('  <script type="text/javascript" src="<%- src %>"></script>')({
          src: rootUrlPathPrefix + pathname
        }))
    )),

    [
      '', '',
      '</body>',
      '</html>'
    ],
  ).join('\n');
}

