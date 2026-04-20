/**
 * StaticRender — Pre-render Blaze routes for SEO.
 *
 * Two modes:
 *   static: 'ssg' — rendered once at startup, cached permanently (about, CGU)
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

  /**
   * Render a Blaze template to an HTML string.
   * @param {String} templateName
   * @param {Object|Function} [data]
   * @param {Object} [context] - { path } for error messages
   * @returns {{ html: String, error: Object|null }}
   */
  render(templateName, data, context) {
    const tmpl = Template[templateName];
    if (!tmpl) {
      const msg = `Template "${templateName}" not found on server. ` +
        'Make sure the template is defined in a .html file loaded by both client and server.';
      console.warn(`[StaticRender] ${msg}`);
      return {
        html: `<!-- [StaticRender] ${msg} -->`,
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
        html: `<!-- [StaticRender] Error in "${templateName}": ${msg} -->`,
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
    const data = route.options.staticData
      ? await route.options.staticData(params)
      : undefined;

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
    const data = route.options.staticData
      ? await route.options.staticData(params)
      : undefined;

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
      if (!route.options.static || !route.options.template) continue;

      const mode = route.options.static; // 'ssg', 'ssr', or true (legacy → treat as 'ssg')

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

        for (const pathInfo of paths) {
          const path = typeof pathInfo === 'string' ? pathInfo : pathInfo.path;
          const params = typeof pathInfo === 'string' ? {} : (pathInfo.params || {});
          await this._renderAndCache(route, path, params);
        }
      } else {
        await this._renderAndCache(route, route.pathDef, {});
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

WebApp.connectHandlers.use(async function staticRenderMiddleware(req, res, next) {
  if (!_ready) return next();

  // Only handle page-serving methods — skip DDP/methods/API calls.
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();

  const path = req.url.split('?')[0];

  // Early-skip for well-known non-app paths to avoid unnecessary work
  // (the Meteor boilerplate handler doesn't run on these either).
  if (
    path.startsWith('/packages/') ||
    path.startsWith('/sockjs/') ||
    path.startsWith('/__meteor__/') ||
    path.startsWith('/merged-stylesheets') ||
    NON_APP_PATH_EXT.test(path)
  ) {
    return next();
  }

  // 1. Try SSG cache first (fast path)
  const cached = cache.get(path);
  if (cached) {
    req.dynamicBody = (req.dynamicBody || '') +
      '<div data-static-render="ssg">' + cached.body + '</div>';
    if (cached.head) {
      req.dynamicHead = (req.dynamicHead || '') + cached.head;
    }
    return next();
  }

  // 2. Try SSR routes (render on-the-fly with fresh data).
  // Uses FlowRouter.matchPath() so server routing matches client routing.
  if (_ssrRoutes.size > 0) {
    const routeInfo = StaticRender._findSSRRouteForPath(path);
    if (routeInfo) {
      try {
        const { body, head } = await StaticRender._renderSSR(
          routeInfo.route, path, routeInfo.params
        );
        req.dynamicBody = (req.dynamicBody || '') +
          '<div data-static-render="ssr">' + body + '</div>';
        if (head) {
          req.dynamicHead = (req.dynamicHead || '') + head;
        }
      } catch (e) {
        console.warn(`[StaticRender] SSR error for "${path}": ${e.message}`);
        // Fall through to normal client-side rendering
      }
      return next();
    }
  }

  next();
});

// ---------------------------------------------------------------------------
// Startup — discover routes, pre-render SSG pages, register SSR routes.
// ---------------------------------------------------------------------------

Meteor.startup(async function () {
  await StaticRender._discoverAndRender();
  _ready = true;
  StaticRender._ready = true;

  const ssgCount = cache.size;
  const ssrCount = _ssrRoutes.size;

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
});
