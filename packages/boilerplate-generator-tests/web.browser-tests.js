import { parse, serialize } from 'parse5';
import { generateHTMLForArch } from './test-lib';

const html = generateHTMLForArch('web.browser');

Tinytest.add("boilerplate-generator-tests - web.browser - well-formed html", function (test) {
  const formatted = serialize(parse(html));
  test.isTrue(formatted.replace(/\s/g, '') === html.replace(/\s/g, ''));
});

Tinytest.add("boilerplate-generator-tests - web.browser - include htmlAttributes", function (test) {
  test.matches(html, /foo="foobar"/);
});

Tinytest.add("boilerplate-generator-tests - web.browser - escape htmlAttributes", function (test) {
  test.matches(html, /gems="&amp;&quot;"/);
});

Tinytest.add("boilerplate-generator-tests - web.browser - include js", function (test) {
  test.matches(html, /<script[^<>]*src="[^<>]*templating[^<>]*">/);
});

Tinytest.add("boilerplate-generator-tests - web.browser - escape js", function (test) {
  test.matches(html, /<script[^<>]*src="[^<>]*templating[^<>]*&amp;v=&quot;1&quot;[^<>]*">/);
});

Tinytest.add("boilerplate-generator-tests - web.browser - include css", function (test) {
  test.matches(html, /<link[^<>]*href="[^<>]*bootstrap[^<>]*">/);
});

Tinytest.add("boilerplate-generator-tests - web.browser - escape css", function (test) {
  test.matches(html, /<link[^<>]*href="[^<>]*bootstrap[^<>]*&amp;v=&quot;1&quot;[^<>]*">/);
});

Tinytest.add("boilerplate-generator-tests - web.browser - call rewriteHook", function (test) {
  test.matches(html, /\+rewritten_url=true/);
});

Tinytest.add("boilerplate-generator-tests - web.browser - include runtime config", function (test) {
  test.matches(html, /<script[^<>]*>[^<>]*__meteor_runtime_config__ =.*decodeURIComponent\(config123\)/);
});
