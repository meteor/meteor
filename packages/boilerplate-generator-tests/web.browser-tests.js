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
