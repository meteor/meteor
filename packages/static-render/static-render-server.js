/**
 * StaticRender — Pre-render Blaze routes for SEO.
 *
 * Two modes:
 *   static: 'ssg' — rendered once at startup, kept in memory until invalidated
 *   static: 'ssr' — rendered at each request with fresh data from MongoDB (products, articles)
 *
 * Both inject HTML into the Meteor boilerplate via dynamicBody/dynamicHead so that
 * crawlers see real content while the client JS still loads and hydrates.
 *
 * Inspired by meteor/blaze#481 for graceful error handling.
 */

const cache = new Map();       // SSG cache: path → { body, head }
const _ssrRoutes = new Map();  // SSR route registry: pathDef → route
const _errors = [];
let _ready = false;

// ---------------------------------------------------------------------------
// Server-side stubs for client-only APIs
// ---------------------------------------------------------------------------

/**
 * Neutralise comment delimiters so a diagnostic can never break out of the
 * <!-- --> wrapper it is emitted into. Error messages can carry request-derived
 * text, and a "-->" inside one would inject markup into the served page.
 */
function commentSafe(text) {
  return String(text).replace(/--+/g, '-');
}

const ssgError = (api, suggestion) => function () {
  throw new Meteor.Error(
    'ssg-client-only-api',
    `"${api}" is not available during server rendering. ${suggestion}`
  );
};

// Use globalThis assignment (explicit, strict-mode safe) instead of bare
// identifier assignment. Only installed if no Session global already exists,
// so we don't clash with a user-provided session package or similar.
if (typeof globalThis.Session === 'undefined') {
  globalThis.Session = {
    get: ssgError('Session.get', 'Use staticData() in your route options instead.'),
    set: ssgError('Session.set', 'Session is client-only.'),
    equals: ssgError('Session.equals', 'Use staticData() in your route options instead.'),
    setDefault: ssgError('Session.setDefault', 'Session is client-only.'),
  };
}

// ---------------------------------------------------------------------------
// Core rendering
// ---------------------------------------------------------------------------

StaticRender = {
  _cache: cache,
  _ssrRoutes,
  _errors,
  _ready: false,
  _decodePath: decodePathSegments,

  /**
   * Render a Blaze template to an HTML string.
   * @param {String} templateName
   * @param {Object|Function} [data]
   * @param {Object} [context] - { path } for error messages
   * @returns {{ html: String, error: Object|null }}
   */
  render(templateName, data, context) {
    // `Template` is only exported to the server by Blaze 3.1+ (meteor/blaze#507).
    // On older Blaze the identifier does not exist at all, so reading it would
    // throw a ReferenceError instead of degrading — check before touching it.
    if (typeof Template === 'undefined') {
      const msg = 'Blaze does not expose the Template registry on the server. ' +
        'Server rendering requires Blaze 3.1+; pages are served without pre-rendered content.';
      console.warn(`[StaticRender] ${msg}`);
      return {
        html: `<!-- [StaticRender] ${commentSafe(msg)} -->`,
        error: { template: templateName, path: context?.path, message: msg },
      };
    }

    const tmpl = Template[templateName];
    if (!tmpl) {
      const msg = `Template "${templateName}" not found on server. ` +
        'Make sure the template is defined in a .html file loaded by both client and server.';
      console.warn(`[StaticRender] ${msg}`);
      return {
        html: `<!-- [StaticRender] ${commentSafe(msg)} -->`,
        error: { template: templateName, path: context?.path, message: msg },
      };
    }

    try {
      const resolvedData = typeof data === 'function' ? data() : data;
      const html = resolvedData
        ? Blaze.toHTMLWithData(tmpl, resolvedData)
        : Blaze.toHTML(tmpl);
      return { html, error: null };
    } catch (e) {
      const msg = e.reason || e.message;
      console.warn(
        `[StaticRender] Error rendering "${templateName}"` +
        (context?.path ? ` for "${context.path}"` : '') +
        `:\n  ${msg}\n` +
        '  This page will be served without pre-rendered content.'
      );
      return {
        html: `<!-- [StaticRender] Error in "${commentSafe(templateName)}": ${commentSafe(msg)} -->`,
        error: { template: templateName, path: context?.path, message: msg },
      };
    }
  },

  /**
   * Regenerate a single SSG cached page. No-op for SSR routes (they render
   * fresh per request and don't use the cache).
   * @param {String} path
   */
  async regenerate(path) {
    const routeInfo = this._findRouteForPath(path);
    if (!routeInfo) {
      console.warn(
        `[StaticRender] No SSG route found for path "${path}" ` +
        '(SSR routes render per-request and do not use the cache)'
      );
      return;
    }
    // Drop any prior error for this path so repeated regenerate() calls on a
    // failing path don't grow _errors unboundedly.
    for (let i = _errors.length - 1; i >= 0; i--) {
      if (_errors[i] && _errors[i].path === path) {
        _errors.splice(i, 1);
      }
    }
    const { route, params } = routeInfo;
    await this._renderAndCache(route, path, params);
  },

  /**
   * Regenerate all SSG pages and re-discover SSR routes from scratch so
   * that route mode changes (e.g. 'ssr' → 'ssg') are picked up cleanly.
   */
  async regenerateAll() {
    cache.clear();
    _ssrRoutes.clear();
    _errors.length = 0;
    await this._discoverAndRender();
  },

  /**
   * Invalidate SSG cached pages.
   * @param {String} [path] - Specific path to invalidate, or omit to clear all.
   */
  invalidate(path) {
    if (path) {
      cache.delete(path);
    } else {
      cache.clear();
    }
  },

  /**
   * Get current stats.
   * Note: `errors` reflects SSG/build-time diagnostics only. Per-request SSR
   * failures are logged via console.warn but not accumulated (would leak memory).
   * @returns {{ ssgCacheSize: Number, ssrRoutes: Number, errors: Array, ready: Boolean }}
   */
  stats() {
    return {
      ssgCacheSize: cache.size,
      ssrRoutes: _ssrRoutes.size,
      errors: [..._errors],
      ready: _ready,
    };
  },

  // -------------------------------------------------------------------------
  // Internal methods
  // -------------------------------------------------------------------------

  /**
   * Find an SSG route matching the given path — used only for regenerate()
   * to avoid accidentally writing SSR route output into the SSG cache
   * (which would serve stale snapshots instead of re-rendering per-request).
   */
  _findRouteForPath(path) {
    const fr = Package['ostrio:flow-router-extra'];
    if (!fr) return null;

    const FlowRouter = fr.FlowRouter;
    const match = FlowRouter.matchPath(path);
    if (
      match &&
      match.route &&
      match.route.options.static === 'ssg' &&
      match.route.options.template
    ) {
      return { route: match.route, params: match.params };
    }
    return null;
  },

  /**
   * Find an SSR route matching the given path, reusing FlowRouter.matchPath
   * so server routing mirrors client routing exactly. Returns the ORIGINAL
   * route object from _ssrRoutes (not the clone from matchPath, which would
   * lose function references in options like staticData/staticHead).
   */
  _findSSRRouteForPath(path) {
    const fr = Package['ostrio:flow-router-extra'];
    if (!fr) return null;

    const FlowRouter = fr.FlowRouter;
    const match = FlowRouter.matchPath(path);
    if (match && match.route && _ssrRoutes.has(match.route.pathDef)) {
      return { route: _ssrRoutes.get(match.route.pathDef), params: match.params };
    }
    return null;
  },

  /**
   * Render a route and store the result in the SSG cache.
   */
  async _renderAndCache(route, path, params) {
    let data;
    if (route.options.staticData) {
      try {
        data = await route.options.staticData(params);
      } catch (e) {
        const message = `staticData() failed: ${e.reason || e.message}`;
        console.warn(
          `[StaticRender] ${message} for "${path}" — this page will be served ` +
          'without pre-rendered content.'
        );
        _errors.push({ template: route.options.template, path, message });
        return;
      }
    }

    const context = { path };
    const { html: body, error } = this.render(route.options.template, data, context);

    let head = undefined;
    if (route.options.staticHead) {
      try {
        head = await route.options.staticHead(params);
      } catch (e) {
        console.warn(`[StaticRender] Error in staticHead for "${path}": ${e.message}`);
      }
    }

    if (error) {
      _errors.push(error);
    }

    cache.set(path, { body, head });
  },

  /**
   * Render a route on-the-fly for SSR (no cache).
   * Errors are logged via console.warn inside render(); SSR errors are
   * intentionally NOT accumulated in _errors — that would leak memory
   * on long-running servers. _errors reflects only SSG/build diagnostics.
   */
  async _renderSSR(route, path, params) {
    let data;
    if (route.options.staticData) {
      try {
        data = await route.options.staticData(params);
      } catch (e) {
        console.warn(
          `[StaticRender] staticData() failed for "${path}": ${e.reason || e.message} — ` +
          'serving without pre-rendered content.'
        );
        return null;
      }
    }

    const context = { path };
    const { html: body } = this.render(route.options.template, data, context);

    let head = undefined;
    if (route.options.staticHead) {
      try {
        head = await route.options.staticHead(params);
      } catch (e) {
        console.warn(`[StaticRender] Error in staticHead for "${path}": ${e.message}`);
      }
    }

    return { body, head };
  },

  /**
   * Discover routes and pre-render SSG pages + register SSR routes.
   */
  async _discoverAndRender() {
    const fr = Package['ostrio:flow-router-extra'];
    if (!fr) return;

    const FlowRouter = fr.FlowRouter;

    // FlowRouter._routes is an internal property — guard defensively in case
    // it's not yet initialized or the shape changes upstream.
    const routes = Array.isArray(FlowRouter._routes) ? FlowRouter._routes : [];
    if (routes.length === 0) return;

    for (const route of routes) {
      // One failing route must never take the whole pre-render pass — and with
      // it the server boot — down with it.
      try {
        if (!route.options.static || !route.options.template) continue;

        const mode = route.options.static;

        // Only the two documented modes are accepted. Previously any truthy
        // value fell through to SSG, so `static: true` was pre-rendered here
        // while regenerate() — which matches on 'ssg' exactly — silently found
        // nothing for it.
        if (mode !== 'ssg' && mode !== 'ssr') {
          console.warn(
            `[StaticRender] Route "${route.pathDef}" has static: ${JSON.stringify(mode)}, ` +
            "expected 'ssg' or 'ssr' — skipping it."
          );
          continue;
        }

        if (mode === 'ssr') {
          // SSR routes: register for on-the-fly rendering at request time
          _ssrRoutes.set(route.pathDef, route);
          continue;
        }

        // SSG routes: pre-render at startup
        if (route.options.staticPaths) {
          let paths;
          try {
            paths = await route.options.staticPaths();
          } catch (e) {
            console.warn(
              `[StaticRender] Error in staticPaths for route "${route.pathDef}": ${e.message}`
            );
            _errors.push({
              template: route.options.template,
              path: route.pathDef,
              message: `staticPaths() failed: ${e.message}`,
            });
            continue;
          }

          if (!Array.isArray(paths)) {
            console.warn(
              `[StaticRender] staticPaths() for "${route.pathDef}" must return an array, ` +
              `got ${typeof paths} — skipping this route.`
            );
            continue;
          }

          for (const pathInfo of paths) {
            const path = typeof pathInfo === 'string' ? pathInfo : pathInfo?.path;
            if (!path) {
              console.warn(
                `[StaticRender] staticPaths() for "${route.pathDef}" returned an entry ` +
                'without a path — skipping it.'
              );
              continue;
            }
            const params = typeof pathInfo === 'string' ? {} : (pathInfo.params || {});
            await this._renderAndCache(route, path, params);
          }
        } else if (/[:*]/.test(route.pathDef)) {
          console.warn(
            `[StaticRender] SSG route "${route.pathDef}" has dynamic segments but no ` +
            'staticPaths(). Caching it under the literal pattern would produce a key ' +
            'no request can match — add staticPaths() to enumerate the paths to ' +
            'pre-render, or use static: \'ssr\'.'
          );
        } else {
          await this._renderAndCache(route, route.pathDef, {});
        }
      } catch (e) {
        const message = e.reason || e.message;
        console.warn(`[StaticRender] Failed to process route "${route.pathDef}": ${message}`);
        _errors.push({
          template: route.options?.template,
          path: route.pathDef,
          message,
        });
      }
    }
  },
};

// ---------------------------------------------------------------------------
// Middleware — handles both SSG (from cache) and SSR (render on-the-fly).
//
// Filters:
// - Only GET/HEAD requests (the only methods used to serve pages)
// - Skip well-known non-app paths: /packages/, /sockjs/, /__meteor__/,
//   /merged-stylesheets, and paths with common static-asset extensions
// ---------------------------------------------------------------------------

const NON_APP_PATH_EXT = /\.(js|css|map|png|jpe?g|svg|gif|ico|woff2?|ttf|eot|webp|avif)$/i;

/**
 * Decode a request path one segment at a time. Cache keys come from
 * staticPaths() output or pathDef, which are written decoded, while req.url is
 * percent-encoded — so "/blog/caf%C3%A9" has to become "/blog/café" to match.
 * Decoding the whole path at once would turn an encoded %2F into a separator
 * and change the route structure, so each segment is decoded on its own, and a
 * segment that is not valid encoding is left as-is rather than throwing.
 */
function decodePathSegments(path) {
  return path
    .split('/')
    .map((segment) => {
      try {
        // Re-escape any separator produced by decoding (%2F) so a crafted URL
        // cannot decode into a different path structure than it was sent as.
        return decodeURIComponent(segment).replace(/\//g, '%2F');
      } catch (e) {
        return segment;
      }
    })
    .join('/');
}

/**
 * Attach pre-rendered markup to the request, if any applies. Plain `return`
 * means "nothing to inject" — the caller always continues the chain.
 */
async function injectPreRendered(req) {
  if (!_ready) return;

  // Only handle page-serving methods — skip DDP/methods/API calls.
  if (req.method !== 'GET' && req.method !== 'HEAD') return;

  const path = decodePathSegments(req.url.split('?')[0]);

  // Early-skip for well-known non-app paths to avoid unnecessary work
  // (the Meteor boilerplate handler doesn't run on these either).
  if (
    path.startsWith('/packages/') ||
    path.startsWith('/sockjs/') ||
    path.startsWith('/__meteor__/') ||
    path.startsWith('/merged-stylesheets') ||
    NON_APP_PATH_EXT.test(path)
  ) {
    return;
  }

  // 1. Try SSG cache first (fast path)
  const cached = cache.get(path);
  if (cached) {
    req.dynamicBody = (req.dynamicBody || '') +
      '<div data-static-render="ssg">' + cached.body + '</div>';
    if (cached.head) {
      req.dynamicHead = (req.dynamicHead || '') + cached.head;
    }
    return;
  }

  // 2. Try SSR routes (render on-the-fly with fresh data).
  // Uses FlowRouter.matchPath() so server routing matches client routing.
  if (_ssrRoutes.size > 0) {
    const routeInfo = StaticRender._findSSRRouteForPath(path);
    if (routeInfo) {
      try {
        const rendered = await StaticRender._renderSSR(
          routeInfo.route, path, routeInfo.params
        );
        // null means staticData() failed — serve the plain shell instead.
        if (rendered) {
          req.dynamicBody = (req.dynamicBody || '') +
            '<div data-static-render="ssr">' + rendered.body + '</div>';
          if (rendered.head) {
            req.dynamicHead = (req.dynamicHead || '') + rendered.head;
          }
        }
      } catch (e) {
        console.warn(`[StaticRender] SSR error for "${path}": ${e.message}`);
        // Fall through to normal client-side rendering
      }
    }
  }
}

WebApp.connectHandlers.use(async function staticRenderMiddleware(req, res, next) {
  // Nothing here may reject. WebApp.connectHandlers is an Express 5 sub-app,
  // and Express 5 forwards a rejected handler promise to next(err) — which
  // skips the boilerplate handler and serves a 500 instead of the app shell.
  // Pre-rendering is an enhancement: on any failure, fall through silently.
  try {
    await injectPreRendered(req);
  } catch (e) {
    console.warn(
      `[StaticRender] Skipped pre-render for "${req.url}": ${e.reason || e.message}`
    );
  }
  next();
});

// ---------------------------------------------------------------------------
// Startup — discover routes, pre-render SSG pages, register SSR routes.
// ---------------------------------------------------------------------------

// This package loads before app code, so its startup callback is queued before
// the app's. Registering the real work from inside a first callback appends it
// after every callback queued so far — boot.js drains startupHooks with a
// shift() loop and documents that hooks added during the drain run at the end.
// Without this, discovery would snapshot the route table before routes declared
// in the app's own Meteor.startup exist, and pre-render against unseeded data.
async function discoverAndReport() {
  // A rejection here would reach boot.js's top-level catch, which calls
  // process.exit(1) — pre-rendering must never be able to stop the server
  // from starting.
  try {
    await StaticRender._discoverAndRender();
  } catch (e) {
    console.warn(`[StaticRender] Route discovery failed: ${e.reason || e.message}`);
  }
  _ready = true;
  StaticRender._ready = true;

  const ssgCount = cache.size;
  const ssrCount = _ssrRoutes.size;

  if (ssgCount === 0 && ssrCount === 0 && _errors.length === 0) {
    console.log(
      '[StaticRender] No routes with a static option were found. Add ' +
      "static: 'ssg' or static: 'ssr' to a FlowRouter route to pre-render it."
    );
    return;
  }

  if (ssgCount > 0 || ssrCount > 0 || _errors.length > 0) {
    const parts = [];
    if (ssgCount > 0) parts.push(`${ssgCount} SSG pages pre-rendered`);
    if (ssrCount > 0) parts.push(`${ssrCount} SSR routes registered`);
    console.log(`[StaticRender] ${parts.join(', ')}`);

    if (_errors.length > 0) {
      console.warn(`[StaticRender] ${_errors.length} error(s):`);
      for (const err of _errors) {
        console.warn(
          `  \u26A0 Template "${err.template}"` +
          (err.path ? ` for "${err.path}"` : '') +
          `:\n    ${err.message}`
        );
      }
    }
  }
}

Meteor.startup(function () {
  Meteor.startup(discoverAndReport);
});
