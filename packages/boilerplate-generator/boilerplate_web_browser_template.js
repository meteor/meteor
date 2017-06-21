// Template function for rendering the boilerplate html for browsers
// Replicates the template defined in boilerplate_web.browser.html
// Arguments: root : { htmlAttributes, css : [{ url }], bundledJsCssUrlRewriteHook : Function, head, dynamicHead, body, dynamicBody, inlineScriptsAllowed, additionalStaticJs, meteorRuntimeConfig }

export default function(manifest) {
  const root = manifest;
  // XXX do we need to do some validation on the properties of root?
  return [].concat(
    [
      '<html' +_.map(root.htmlAttributes, (value, key) =>
        _.template(' <%= attrName %>="<%- attrValue %>"')({
          attrName: key,
          attrValue: value
        })
      ).join('') + '>',
      '<head>'
    ],

    _.map(root.css, ({url}) =>
      _.template('  <link rel="stylesheet" type="text/css" class="__meteor-css__" href="<%- href %>">')({
        href: root.bundledJsCssUrlRewriteHook(url)
      })
    ),

    [
      root.head,
      root.dynamicHead,
      '</head>',
      '<body>',
      root.body,
      root.dynamicBody,
      '',
      _.template(root.inlineScriptsAllowed
        ? '  <script type="text/javascript"><%= contents %></script>'
        : '  <script type="text/javascript" src="<%- src %>"></script>'
      )({
        contents: _.template('__meteor_runtime_config__ = JSON.parse(decodeURIComponent(<%= conf %>))')({
          conf: root.meteorRuntimeConfig
        }),
        src: root.rootUrlPathPrefix + '/meteor_runtime_config.js'
      }),
      ''
    ],

    _.map(root.js, ({url}) =>
      _.template('  <script type="text/javascript" src="<%- src %>"></script>')({
        src: root.bundledJsCssUrlRewriteHook(url)
      })
    ),

    _.map(root.additionalStaticJs, ({contents, pathname}) => (
      _.template(root.inlineScriptsAllowed
        ? '  <script><%= contents %></script>'
        : '  <script type="text/javascript" src="<%- src %>"></script>'
      )({
        contents: contents,
        src: root.rootUrlPathPrefix + pathname
      })
    )),

    [
      '', '',
      '</body>',
      '</html>'
    ],

    ['', '<!-- Generated for cordova by boilerplate-generator -->']
  ).join('\n');
}

