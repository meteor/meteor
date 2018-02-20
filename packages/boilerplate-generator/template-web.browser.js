import template from './template';

export const headTemplate = ({
  css,
  htmlAttributes,
  bundledJsCssUrlRewriteHook,
  head,
  dynamicHead,
}) => {
  var headSections = head.split(/<meteor-bundled-css[^<>]*>/, 2);
  var cssBundle = [...(css || []).map(file =>
    template('  <link rel="stylesheet" type="text/css" class="__meteor-css__" href="<%- href %>">')({
      href: bundledJsCssUrlRewriteHook(file.url),
    })
  )].join('\n');

  return [
    '<html' + Object.keys(htmlAttributes || {}).map(
      key => template(' <%= attrName %>="<%- attrValue %>"')({
        attrName: key,
        attrValue: htmlAttributes[key],
      })
    ).join('') + '>',
    
    '<head>',

    (headSections.length === 1)
      ? [cssBundle, headSections[0]].join('\n')
      : [headSections[0], cssBundle, headSections[1]].join('\n'),

    dynamicHead,
    '</head>',
    '<body>',
  ].join('\n');
};

// Template function for rendering the boilerplate html for browsers
export const closeTemplate = ({
  meteorRuntimeConfig,
  rootUrlPathPrefix,
  inlineScriptsAllowed,
  js,
  additionalStaticJs,
  bundledJsCssUrlRewriteHook,
}) => [
  '',
  inlineScriptsAllowed
    ? template('  <script type="text/javascript">__meteor_runtime_config__ = JSON.parse(decodeURIComponent(<%= conf %>))</script>')({
      conf: meteorRuntimeConfig,
    })
    : template('  <script type="text/javascript" src="<%- src %>/meteor_runtime_config.js"></script>')({
      src: rootUrlPathPrefix,
    }),
  '',

  ...(js || []).map(file =>
    template('  <script type="text/javascript" src="<%- src %>"></script>')({
      src: bundledJsCssUrlRewriteHook(file.url),
    })
  ),

  ...(additionalStaticJs || []).map(({ contents, pathname }) => (
    inlineScriptsAllowed
      ? template('  <script><%= contents %></script>')({
        contents,
      })
      : template('  <script type="text/javascript" src="<%- src %>"></script>')({
        src: rootUrlPathPrefix + pathname,
      })
  )),

  '',
  '',
  '</body>',
  '</html>'
].join('\n');
