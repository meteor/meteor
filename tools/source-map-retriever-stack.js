import sourceMapSupport from 'source-map-support';

// Why this file exists:
// We have two places in the tool where we need to do source maps:
// 1. Loaded isopacks, which use a special custom source map cache
// 2. Transpiled tool code from Babel
//
// In order to avoid crazy bootstrapping, it would be nice to be able to add
// functions to look for source maps, so that we can call
// sourceMapSupport.install as early as possible, and not worry about having
// the right data structures around.
//
// This module maintains a stack of source map retrieval functions, which are
// called in reverse order until one returns a truthy value.

const stack = [];

// Add a function to locate source maps; all of the functions are executed in
// reverse order
export function push(func) {
  stack.push(func);
}

function tryAllSourceMapRetrievers(filename) {
  for (let i = stack.length - 1; i >= 0; i--) {
    const sourceMapData = stack[i](filename);

    if (sourceMapData) {
      return sourceMapData;
    }
  }

  return null;
}

function wrapCallSite(unwrappedFrame) {
  const frame = sourceMapSupport.wrapCallSite(unwrappedFrame);
  function wrapGetter(name) {
    const origGetter = frame[name];
    frame[name] = function(arg) {
      // replace a custom location domain that we set for better UX in Chrome
      // DevTools (separate domain group) in source maps.
      const source = origGetter(arg);
      if (!source) {
        return source;
      }
      return source.replace(/(^|\()meteor:\/\/..app\//, '$1');
    };
  }
  wrapGetter('getScriptNameOrSourceURL');
  wrapGetter('getEvalOrigin');

  return frame;
}


sourceMapSupport.install({
  retrieveSourceMap: tryAllSourceMapRetrievers,
  // For now, don't fix the source line in uncaught exceptions, because we
  // haven't fixed handleUncaughtExceptions in source-map-support to properly
  // locate the source files.
  handleUncaughtExceptions: false,
  wrapCallSite
});

// Default retrievers

// Always fall back to the default in the end
push(sourceMapSupport.retrieveSourceMap);

/* eslint-disable max-len */
push(require('meteor-babel/register').retrieveSourceMap); // #RemoveInProd this line is removed in isopack.js
/* eslint-enable max-len */
