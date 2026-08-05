import { parse, serialize } from 'parse5';
import { generateHTMLForArch } from './test-lib';

Tinytest.addAsync(
  "boilerplate-generator-tests - web.browser - basic output",
  async function (test) {
    const html = await generateHTMLForArch("web.browser", false);

    // well-formed html
    const formatted = serialize(parse(html));
    test.isTrue(formatted.replace(/\s/g, '') === html.replace(/\s/g, ''));

    // include htmlAttributes
    test.matches(html, /foo="foobar"/);

    // escape htmlAttributes
    test.matches(html, /gems="&amp;&quot;"/);

    // include js
    test.matches(html, /<script[^<>]*src="[^<>]*templating[^<>]*">/);

    // escape js
    test.matches(html, /<script[^<>]*src="[^<>]*templating[^<>]*&amp;v=&quot;1&quot;[^<>]*">/);

    // include css
    test.matches(html, /<link[^<>]*href="[^<>]*bootstrap[^<>]*">/);

    // escape css
    test.matches(html, /<link[^<>]*href="[^<>]*bootstrap[^<>]*&amp;v=&quot;1&quot;[^<>]*">/);

    // call rewriteHook
    test.matches(html, /\+rewritten_url=true/);

    // include runtime config
    test.matches(html, /<script[^<>]*>[^<>]*__meteor_runtime_config__ =.*decodeURIComponent\(config123\)/);
  }
);

// https://github.com/meteor/meteor-feature-requests/issues/24
Tinytest.addAsync(
  "boilerplate-generator-tests - web.browser - meteor-bundled-css",
  async function (test) {
    const html = await generateHTMLForArch("web.browser", true);

    // include CSS
    test.matches(html, /<link[^<>]*href="[^<>]*bootstrap[^<>]*">/, "include CSS");

    // css in correct location
    const meta1 = html.search(/<meta name="1"[^<>]*>/);
    const meta2 = html.search(/<meta name="2"[^<>]*>/);
    const css = html.search(/<link[^<>]*href="[^<>]*bootstrap[^<>]*">/);

    // CSS is after meta1
    test.isTrue(meta1 < css, "CSS is NOT after meta1");

    // CSS is before meta2
    test.isTrue(css < meta2, "CSS is NOT before meta2");
  }
);

// https://github.com/meteor/meteor/issues/14523
Tinytest.addAsync(
  "boilerplate-generator-tests - web.browser - custom script URL receives " +
    "the ROOT_URL path prefix",
  async function (test) {
    const originalUrl = process.env.METEOR_APP_CUSTOM_SCRIPT_URL;
    try {
      // Root-relative URLs are prefixed like every other bundled script
      process.env.METEOR_APP_CUSTOM_SCRIPT_URL = '/__rspack__/client-rspack.js';
      let html = await generateHTMLForArch('web.browser', false, {
        rootUrlPathPrefix: '/prefix',
      });
      test.matches(
        html,
        /<script[^<>]*src="\/prefix\/__rspack__\/client-rspack\.js">/
      );

      // URLs already carrying the prefix are not prefixed twice
      process.env.METEOR_APP_CUSTOM_SCRIPT_URL =
        '/prefix/__rspack__/client-rspack.js';
      html = await generateHTMLForArch('web.browser', false, {
        rootUrlPathPrefix: '/prefix',
      });
      test.matches(
        html,
        /<script[^<>]*src="\/prefix\/__rspack__\/client-rspack\.js">/
      );
      test.isFalse(/src="\/prefix\/prefix\//.test(html));

      // Query strings and fragments do not defeat the prefix boundary check
      for (const suffix of ['?cache=1', '#fragment']) {
        process.env.METEOR_APP_CUSTOM_SCRIPT_URL = `/prefix${suffix}`;
        html = await generateHTMLForArch('web.browser', false, {
          rootUrlPathPrefix: '/prefix',
        });
        test.matches(html, new RegExp(`src="/prefix\\${suffix[0]}`));
        test.isFalse(/src="\/prefix\/prefix/.test(html));
      }

      // Protocol-relative and relative URLs are owned by the caller
      for (const customUrl of [
        '//cdn.example.com/client-rspack.js',
        'client-rspack.js',
        './client-rspack.js',
      ]) {
        process.env.METEOR_APP_CUSTOM_SCRIPT_URL = customUrl;
        html = await generateHTMLForArch('web.browser', false, {
          rootUrlPathPrefix: '/prefix',
        });
        test.isTrue(html.includes(`src="${customUrl}"`));
      }

      // Absolute URLs pass through untouched
      process.env.METEOR_APP_CUSTOM_SCRIPT_URL =
        'https://cdn.example.com/client-rspack.js';
      html = await generateHTMLForArch('web.browser', false, {
        rootUrlPathPrefix: '/prefix',
      });
      test.matches(
        html,
        /<script[^<>]*src="https:\/\/cdn\.example\.com\/client-rspack\.js">/
      );

      // Without a prefix the URL is emitted verbatim
      process.env.METEOR_APP_CUSTOM_SCRIPT_URL = '/__rspack__/client-rspack.js';
      html = await generateHTMLForArch('web.browser', false, {
        rootUrlPathPrefix: '',
      });
      test.matches(
        html,
        /<script[^<>]*src="\/__rspack__\/client-rspack\.js">/
      );
    } finally {
      if (originalUrl === undefined) {
        delete process.env.METEOR_APP_CUSTOM_SCRIPT_URL;
      } else {
        process.env.METEOR_APP_CUSTOM_SCRIPT_URL = originalUrl;
      }
    }
  }
);

// https://github.com/meteor/meteor/issues/9149
Tinytest.addAsync(
  "boilerplate-generator-tests - web.browser - properly render boilerplate " +
    "elements when _.template settings are overridden",
  async function (test) {
    const newHtml = await generateHTMLForArch("web.browser", false);

    test.matches(newHtml, /foo="foobar"/);
    test.matches(newHtml, /<link[^<>]*href="[^<>]*bootstrap[^<>]*">/);
    test.matches(newHtml, /<script[^<>]*src="[^<>]*templating[^<>]*">/);
    test.matches(newHtml, /<script>var a/);
    test.matches(
      newHtml,
        /<script[^<>]*>[^<>]*__meteor_runtime_config__ =.*decodeURIComponent\(config123\)/
    );
  }
);
