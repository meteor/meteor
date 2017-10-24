import template from './template';

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
      '<html' + Object.keys(htmlAttributes || {}).map(key =>
        template(' <%= attrName %>="<%- attrValue %>"')({
          attrName: key,
          attrValue: htmlAttributes[key]
        })
      ).join('') + '>',
      '<head>'
    ],

    (css || []).map(({ url }) =>
      template('  <link rel="stylesheet" type="text/css" class="__meteor-css__" href="<%- href %>">')({
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
        ? template('  <script type="text/javascript">__meteor_runtime_config__ = JSON.parse(decodeURIComponent(<%= conf %>))</script>')({
          conf: meteorRuntimeConfig
        })
        : template('  <script type="text/javascript" src="<%- src %>/meteor_runtime_config.js"></script>')({
          src: rootUrlPathPrefix
        })
      ) ,
      ''
    ],

    (js || []).map(({ url }) =>
      template('  <script type="text/javascript" src="<%- src %>"></script>')({
        src: bundledJsCssUrlRewriteHook(url)
      })
    ),

    (additionalStaticJs || []).map(({ contents, pathname }) => (
      (inlineScriptsAllowed
        ? template('  <script><%= contents %></script>')({
          contents: contents
        })
        : template('  <script type="text/javascript" src="<%- src %>"></script>')({
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
