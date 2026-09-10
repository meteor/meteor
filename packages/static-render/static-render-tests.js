// Tests run against whatever Blaze the release ships. On a Blaze without
// meteor/blaze#507 the Template registry is absent on the server, so render()
// degrades to a placeholder comment — these tests assert that degradation
// rather than requiring server-side templates, which keeps them meaningful on
// every release.

const FR_KEY = 'ostrio:flow-router-extra';

const route = (pathDef, options) => ({ pathDef, options });

const reset = () => {
  StaticRender._cache.clear();
  StaticRender._ssrRoutes.clear();
  StaticRender._errors.length = 0;
};

// Swap a minimal FlowRouter in place of the real weak dependency so discovery
// can be exercised without installing a router.
const withRoutes = async (routes, fn) => {
  const previous = Package[FR_KEY];
  Package[FR_KEY] = {
    FlowRouter: {
      _routes: routes,
      matchPath(path) {
        const match = routes.find((r) => r.pathDef === path);
        return match ? { route: match, params: {} } : null;
      },
    },
  };
  reset();
  try {
    return await fn();
  } finally {
    if (previous === undefined) {
      delete Package[FR_KEY];
    } else {
      Package[FR_KEY] = previous;
    }
    reset();
  }
};

// ---------------------------------------------------------------------------
// render()
// ---------------------------------------------------------------------------

Tinytest.add('static-render - render returns a closed comment and an error when it cannot render', (test) => {
  const { html, error } = StaticRender.render('noSuchTemplate', undefined, { path: '/x' });

  test.isTrue(html.startsWith('<!--'), 'wraps the diagnostic in a comment');
  test.isTrue(html.endsWith('-->'), 'closes the comment');
  test.isTrue(!!error, 'reports an error object');
  test.equal(error.path, '/x', 'carries the request path');
});

Tinytest.add('static-render - render never emits a comment that closes early', (test) => {
  const { html } = StaticRender.render('evil--> <script>x</script>', undefined, {});
  const body = html.slice(4, -3); // strip the outer <!-- and -->

  test.equal(body.indexOf('-->'), -1, 'inner text cannot close the comment');
});

// ---------------------------------------------------------------------------
// Path decoding
// ---------------------------------------------------------------------------

Tinytest.add('static-render - decodes percent-encoded path segments', (test) => {
  test.equal(StaticRender._decodePath('/blog/caf%C3%A9'), '/blog/café');
  test.equal(StaticRender._decodePath('/about'), '/about');
});

Tinytest.add('static-render - decoding cannot introduce a path separator', (test) => {
  test.equal(StaticRender._decodePath('/a%2Fb'), '/a%2Fb');
});

Tinytest.add('static-render - malformed encoding is left alone rather than throwing', (test) => {
  test.equal(StaticRender._decodePath('/articles/%E0%A4%A'), '/articles/%E0%A4%A');
  test.equal(StaticRender._decodePath('/articles/%'), '/articles/%');
});

// ---------------------------------------------------------------------------
// Cache management
// ---------------------------------------------------------------------------

Tinytest.add('static-render - invalidate clears one path or all of them', (test) => {
  reset();
  StaticRender._cache.set('/a', { body: 'a' });
  StaticRender._cache.set('/b', { body: 'b' });

  StaticRender.invalidate('/a');
  test.equal(StaticRender._cache.size, 1, 'removes only the named path');
  test.isTrue(StaticRender._cache.has('/b'), 'leaves the others');

  StaticRender.invalidate();
  test.equal(StaticRender._cache.size, 0, 'clears everything when called bare');
  reset();
});

Tinytest.add('static-render - stats reports counts and copies the error list', (test) => {
  reset();
  StaticRender._cache.set('/a', { body: 'a' });
  StaticRender._errors.push({ path: '/a', message: 'boom' });

  const stats = StaticRender.stats();
  test.equal(stats.ssgCacheSize, 1);
  test.equal(stats.ssrRoutes, 0);
  test.equal(stats.errors.length, 1);

  stats.errors.push({ message: 'not mine' });
  test.equal(StaticRender._errors.length, 1, 'stats returns a copy, not the live array');
  reset();
});

// ---------------------------------------------------------------------------
// Discovery and mode classification
// ---------------------------------------------------------------------------

Tinytest.addAsync('static-render - discovery pre-renders SSG and registers SSR', async (test) => {
  await withRoutes([
    route('/about', { static: 'ssg', template: 'about' }),
    route('/articles/:slug', { static: 'ssr', template: 'article' }),
  ], async () => {
    await StaticRender._discoverAndRender();

    test.isTrue(StaticRender._cache.has('/about'), 'SSG path is cached');
    test.equal(StaticRender._ssrRoutes.size, 1, 'SSR route is registered');
    test.isTrue(StaticRender._ssrRoutes.has('/articles/:slug'), 'registered under its pathDef');
  });
});

Tinytest.addAsync('static-render - discovery skips unsupported static modes', async (test) => {
  await withRoutes([
    route('/legacy', { static: true, template: 'legacy' }),
    route('/typo', { static: 'statik', template: 'typo' }),
  ], async () => {
    await StaticRender._discoverAndRender();

    test.equal(StaticRender._cache.size, 0, 'nothing is pre-rendered');
    test.equal(StaticRender._ssrRoutes.size, 0, 'nothing is registered');
  });
});

Tinytest.addAsync('static-render - discovery skips routes with no static option', async (test) => {
  await withRoutes([
    route('/plain', { template: 'plain' }),
    route('/noTemplate', { static: 'ssg' }),
  ], async () => {
    await StaticRender._discoverAndRender();
    test.equal(StaticRender._cache.size, 0);
  });
});

Tinytest.addAsync('static-render - an SSG route with params but no staticPaths is not cached', async (test) => {
  await withRoutes([
    route('/products/:slug', { static: 'ssg', template: 'product' }),
  ], async () => {
    await StaticRender._discoverAndRender();

    test.equal(StaticRender._cache.size, 0, 'no entry under the literal pattern');
    test.isFalse(StaticRender._cache.has('/products/:slug'), 'specifically not the pathDef');
  });
});

Tinytest.addAsync('static-render - staticPaths entries are expanded', async (test) => {
  await withRoutes([
    route('/products/:slug', {
      static: 'ssg',
      template: 'product',
      staticPaths: () => ['/products/chair', { path: '/products/desk', params: { slug: 'desk' } }],
    }),
  ], async () => {
    await StaticRender._discoverAndRender();

    test.isTrue(StaticRender._cache.has('/products/chair'), 'string entry');
    test.isTrue(StaticRender._cache.has('/products/desk'), 'object entry');
  });
});

// ---------------------------------------------------------------------------
// Error boundaries — the whole point is that none of these reject
// ---------------------------------------------------------------------------

Tinytest.addAsync('static-render - a throwing staticData does not abort discovery', async (test) => {
  await withRoutes([
    route('/bad', {
      static: 'ssg',
      template: 'bad',
      staticData: () => { throw new Error('db is down'); },
    }),
    route('/good', { static: 'ssg', template: 'good' }),
  ], async () => {
    await StaticRender._discoverAndRender();

    test.isFalse(StaticRender._cache.has('/bad'), 'the failing page is not cached');
    test.isTrue(StaticRender._cache.has('/good'), 'later routes still render');
    test.isTrue(
      StaticRender._errors.some((e) => e.message.indexOf('db is down') !== -1),
      'the failure is recorded'
    );
  });
});

Tinytest.addAsync('static-render - a throwing staticPaths does not abort discovery', async (test) => {
  await withRoutes([
    route('/bad/:x', {
      static: 'ssg',
      template: 'bad',
      staticPaths: () => { throw new Error('enumeration failed'); },
    }),
    route('/good', { static: 'ssg', template: 'good' }),
  ], async () => {
    await StaticRender._discoverAndRender();

    test.isTrue(StaticRender._cache.has('/good'), 'later routes still render');
    test.isTrue(StaticRender._errors.length > 0, 'the failure is recorded');
  });
});

Tinytest.addAsync('static-render - staticPaths returning a non-array is rejected', async (test) => {
  await withRoutes([
    route('/bad/:x', { static: 'ssg', template: 'bad', staticPaths: () => 'not an array' }),
  ], async () => {
    await StaticRender._discoverAndRender();
    test.equal(StaticRender._cache.size, 0, 'nothing is cached');
  });
});

Tinytest.addAsync('static-render - a throwing staticHead still caches the body', async (test) => {
  await withRoutes([
    route('/head', {
      static: 'ssg',
      template: 'head',
      staticHead: () => { throw new Error('head blew up'); },
    }),
  ], async () => {
    await StaticRender._discoverAndRender();

    test.isTrue(StaticRender._cache.has('/head'), 'the page is still cached');
    test.equal(StaticRender._cache.get('/head').head, undefined, 'without a head');
  });
});

Tinytest.addAsync('static-render - SSR rendering returns null when staticData throws', async (test) => {
  const failing = route('/x', {
    static: 'ssr',
    template: 'x',
    staticData: () => { throw new Error('nope'); },
  });

  const result = await StaticRender._renderSSR(failing, '/x', {});
  test.isNull(result, 'signals "nothing to inject" instead of throwing');
});

Tinytest.addAsync('static-render - discovery is a no-op without flow-router-extra', async (test) => {
  const previous = Package[FR_KEY];
  delete Package[FR_KEY];
  reset();
  try {
    await StaticRender._discoverAndRender();
    test.equal(StaticRender._cache.size, 0);
    test.equal(StaticRender._ssrRoutes.size, 0);
  } finally {
    if (previous !== undefined) Package[FR_KEY] = previous;
    reset();
  }
});
