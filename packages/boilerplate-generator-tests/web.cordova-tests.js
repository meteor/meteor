import { parse, serialize } from 'parse5';
import { generateHTMLForArch } from './test-lib';

const html = generateHTMLForArch('web.cordova');

Tinytest.add("boilerplate-generator-tests - web.cordova - well-formed html", function (test) {
  const formatted = serialize(parse(html));
  test.isTrue(formatted.replace(/\s/g, '') === html.replace(/\s/g, ''));
});

Tinytest.add("boilerplate-generator-tests - web.cordova - include js", function (test) {
  test.matches(html, /<script[^<>]*src="[^<>]*templating[^<>]*">/);
});

Tinytest.add("boilerplate-generator-tests - web.cordova - escape js", function (test) {
  test.matches(html, /<script[^<>]*src="[^<>]*templating[^<>]*&amp;v=&quot;1&quot;[^<>]*">/);
});

Tinytest.add("boilerplate-generator-tests - web.cordova - include css", function (test) {
  test.matches(html, /<link[^<>]*href="[^<>]*bootstrap[^<>]*">/);
});

Tinytest.add("boilerplate-generator-tests - web.cordova - escape css", function (test) {
  test.matches(html, /<link[^<>]*href="[^<>]*bootstrap[^<>]*&amp;v=&quot;1&quot;[^<>]*">/);
});

Tinytest.add("boilerplate-generator-tests - web.cordova - do not call rewriteHook", function (test) {
  test.notMatches(html, /\+rewritten_url=true/);
});

Tinytest.add("boilerplate-generator-tests - web.cordova - include runtime config", function (test) {
  test.matches(html, /<script[^<>]*>[^<>]*\n[^<>]*__meteor_runtime_config__ =[^<>]*decodeURIComponent\(config123\)\)/);
});
