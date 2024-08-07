import { HTTP } from 'meteor/http';

// URL prefix for tests to talk to
let _XHR_URL_PREFIX = '/http_test_responder';

const url_base = function () {
  if (Meteor.isServer) {
    const address = WebApp.httpServer.address();
    return 'http://127.0.0.1:' + address.port;
  } else {
    return '';
  }
}

const url_prefix = function () {
  if (Meteor.isServer && _XHR_URL_PREFIX.indexOf('http') !== 0) {
    _XHR_URL_PREFIX = url_base() + _XHR_URL_PREFIX;
  }
  return _XHR_URL_PREFIX;
}

testAsyncMulti('httpcall - basic', [
  async function (test, expect) {
    const basic_get = async function (url, options, expected_url) {
      const callback = function (error, result) {
        test.isFalse(error);
        if (!error) {
          test.equal(typeof result, 'object');
          test.equal(result.statusCode, 200);

          const data = result.data;

          // allow dropping of final ? (which mobile browsers seem to do)
          const allowed = [expected_url];
          if (expected_url.slice(-1) === '?') {
            allowed.push(expected_url.slice(0, -1));
          }

          test.include(allowed, expected_url);
          test.equal(data.method, 'GET');
        }
      };

      HTTP.call('GET', url_prefix() + url, options, expect(callback));

      if (Meteor.isServer) {
        // test sync version
        try {
          const result = await HTTP.call('GET', url_prefix() + url, options);
          callback(undefined, result);
        } catch (e) {
          callback(e, e.response);
        }
      }
    };

    await basic_get('/foo', null, '/foo');
    await basic_get('/foo?', null, '/foo?');
    await basic_get('/foo?a=b', null, '/foo?a=b');
    await basic_get('/foo', { params: { fruit: 'apple' } }, '/foo?fruit=apple');
    await basic_get('/foo', {
      params: {
        fruit: 'apple',
        dog: 'Spot the dog'
      }
    }, '/foo?fruit=apple&dog=Spot+the+dog');
    await basic_get('/foo?', {
      params: {
        fruit: 'apple',
        dog: 'Spot the dog'
      }
    }, '/foo?fruit=apple&dog=Spot+the+dog');
    await basic_get('/foo?bar', {
      params: {
        fruit: 'apple',
        dog: 'Spot the dog'
      }
    }, '/foo?bar&fruit=apple&dog=Spot+the+dog');
    await basic_get('/foo?bar', {
      params: { fruit: 'apple', dog: 'Spot the dog' },
      query: 'baz'
    }, '/foo?baz&fruit=apple&dog=Spot+the+dog');
    await basic_get('/foo', {
      params: { fruit: 'apple', dog: 'Spot the dog' },
      query: 'baz'
    }, '/foo?baz&fruit=apple&dog=Spot+the+dog');
    await basic_get('/foo?', {
      params: { fruit: 'apple', dog: 'Spot the dog' },
      query: 'baz'
    }, '/foo?baz&fruit=apple&dog=Spot+the+dog');
    await basic_get('/foo?bar', { query: '' }, '/foo?');
    await basic_get('/foo?bar', {
      params: { fruit: 'apple', dog: 'Spot the dog' },
      query: ''
    }, '/foo?fruit=apple&dog=Spot+the+dog');
  }]);

testAsyncMulti('httpcall - errors', [
  async function (test, expect) {
    // Accessing unknown server (should fail to make any connection)
    const unknownServerCallback = function (error, result) {
      test.equal(!!error, true,'expected error');
      test.equal(!!result, false,'expected no result');
      test.equal(!!error.response, false, 'expected no response');
    }

    const invalidIp = '0.0.0.199';
    // This is an invalid destination IP address, and thus should always give an error.
    // If your ISP is intercepting DNS misses and serving ads, an obviously
    // invalid URL (http://asdf.asdf) might produce an HTTP response.
    HTTP.call('GET', `http://${invalidIp}/`, expect(unknownServerCallback));

    if (Meteor.isServer) {
      // test sync version
      try {
        const unknownServerResult = await HTTP.call('GET', `http://${invalidIp}/`);
        unknownServerCallback(undefined, unknownServerResult);
      } catch (e) {
        unknownServerCallback(e, e.response);
      }
    }

    // Server serves 500
    const error500Callback = function (error, result) {
      test.equal(!!error, true, 'expect error');
      test.equal(error.message.includes('500'), true, 'expect 500'); // message has statusCode
      test.equal(error.message.includes(error.response.content.substring(0, 10)), true, 'expect res content in message'); // message has part of content

      test.isTrue(result);
      test.isTrue(!!error.response);
      test.equal(result, error.response);
      test.equal(error.response.statusCode, 500);

      // in test_responder.js we make a very long response body, to make sure
      // that we truncate messages. first of all, make sure we didn't make that
      // message too short, so that we can be sure we're verifying that we truncate.
      test.isTrue(error.response.content.length > 520);
      test.isTrue(error.message.length < 520); // make sure we truncate.
    }

    HTTP.call('GET', url_prefix() + '/fail', expect(error500Callback));

    if (Meteor.isServer) {
      // test sync version
      try {
        const error500Result = await HTTP.call('GET', url_prefix() + '/fail');
        error500Callback(undefined, error500Result);
      } catch (e) {
        error500Callback(e, e.response);
      }
    }
  }
]);


testAsyncMulti('httpcall - timeout', [
  async function (test, expect) {

    // Should time out
    const timeoutCallback = function (error, result) {
      test.isTrue(error);
      test.isFalse(result);
      test.isFalse(error.response);
    }
    const timeoutUrl = url_prefix() + '/slow-' + Random.id();
    HTTP.call(
      'GET', timeoutUrl,
      { timeout: 500 },
      expect(timeoutCallback));

    if (Meteor.isServer) {
      // test sync version
      try {
        const timeoutResult = await HTTP.call('GET', timeoutUrl, { timeout: 500 });
        timeoutCallback(undefined, timeoutResult);
      } catch (e) {
        timeoutCallback(e, e.response);
      }
    }

    // Should not time out
    const noTimeoutCallback = function (error, result) {
      test.isFalse(error);
      test.isTrue(result);
      test.equal(result.statusCode, 200);

      const data = result.data;
      test.isTrue(!!data);
      test.equal(data.url.substring(0, 4), '/foo');
      test.equal(data.method, 'GET');
    }
    const noTimeoutUrl = url_prefix() + '/foo-' + Random.id();
    HTTP.call('GET', noTimeoutUrl, { timeout: 2000 }, expect(noTimeoutCallback));
    if (Meteor.isServer) {
      // test sync version
      try {
        const noTimeoutResult = await HTTP.call('GET', noTimeoutUrl, { timeout: 2000 });
        noTimeoutCallback(undefined, noTimeoutResult);
      } catch (e) {
        noTimeoutCallback(e, e.response);
      }
    }
  }
]);

testAsyncMulti('httpcall - redirect', [

  function (test, expect) {
    // Test that we follow redirects by default
    HTTP.call('GET', url_prefix() + '/redirect', expect(
      function (error, result) {
        test.equal(!!error, false, 'expected no error');
        test.equal(!!result, true, 'expected result');

        // should be redirected transparently to /foo
        test.equal(result.statusCode, 200);
        const data = result.data;
        test.equal(data.url, '/foo');
        test.equal(data.method, 'GET');
      }))

    // followRedirect option; can't be false on client
    _.each([false, true], function (followRedirects) {
      const do_it = function (should_work) {
        const maybe_expect = should_work ? expect : _.identity;
        _.each(['GET', 'POST'], function (method) {
          HTTP.call(
            method, url_prefix() + '/redirect',
            { followRedirects: followRedirects },
            maybe_expect(function (error, result) {
              test.equal(!!error, false, 'expected no error');
              test.equal(!!result, true, 'expected result');

              if (followRedirects) {
                // should be redirected transparently to /foo
                test.equal(result.statusCode, 200);
                const data = result.data;
                test.equal(data.url, '/foo');
                // This is "GET" even when the initial request was a
                // POST because browsers follow redirects with a GET
                // even when the initial request was a different method.
                test.equal(data.method, 'GET');
              } else {
                // should see redirect
                test.equal(result.statusCode, 301);
              }
            }));
        });
      }
      if (Meteor.isClient && !followRedirects) {
        // not supported, should fail
        test.throws(do_it);
      } else {
        do_it(true);
      }
    })
  }

])

testAsyncMulti('httpcall - methods', [

  function (test, expect) {
    // non-get methods
    const test_method = function (meth, func_name) {
      func_name = func_name || meth.toLowerCase();
      HTTP[func_name](
        url_prefix() + '/foo',
        expect(function (error, result) {
          test.isFalse(error);
          test.isTrue(result);
          test.equal(result.statusCode, 200);
          const data = result.data;
          test.equal(data.url, '/foo');
          test.equal(data.method, meth);
        }));
    }

    test_method('GET');
    test_method('POST');
    test_method('PUT');
    test_method('DELETE', 'del');
    test_method('PATCH');
  },

  function (test, expect) {
    // contents and data
    HTTP.call(
      'POST', url_prefix() + '/foo',
      { content: 'Hello World!' },
      expect(function (error, result) {
        test.isFalse(error);
        test.isTrue(result);
        test.equal(result.statusCode, 200);
        const data = result.data;
        test.equal(data.body, 'Hello World!');
      }));

    HTTP.call(
      'POST', url_prefix() + '/data-test',
      { data: { greeting: 'Hello World!' } },
      expect(function (error, result) {
        test.isFalse(error);
        test.isTrue(result);
        test.equal(result.statusCode, 200);
        const data = result.data;
        test.equal(data.body, { greeting: 'Hello World!' });
        // nb: some browsers include a charset here too.
        test.matches(data.headers['content-type'], /^application\/json\b/);
      }));

    HTTP.call(
      'POST', url_prefix() + '/data-test-explicit',
      {
        data: { greeting: 'Hello World!' },
        headers: { 'Content-Type': 'text/stupid' }
      },
      expect(function (error, result) {
        test.isFalse(error);
        test.isTrue(result);
        test.equal(result.statusCode, 200);
        const data = result.data;
        test.equal(data.body, { greeting: 'Hello World!' });
        // nb: some browsers include a charset here too.
        test.matches(data.headers['content-type'], /^text\/stupid\b/);
      }));
  }
]);

testAsyncMulti('httpcall - http auth', [
  function (test, expect) {
    // Test basic auth

    // Unfortunately, any failed auth will result in a browser
    // password prompt.  So we don't test auth failure, only
    // success.

    // Random password breaks in Firefox, because Firefox incorrectly
    // uses cached credentials even if we supply different ones:
    // https://bugzilla.mozilla.org/show_bug.cgi?id=654348
    const password = 'rocks';
    //const password = Random.id().replace(/[^0-9a-zA-Z]/g, '');
    HTTP.call(
      'GET', url_prefix() + '/login?' + password,
      { auth: 'meteor:' + password },
      expect(function (error, result) {
        // should succeed
        test.isFalse(error);
        test.isTrue(result);
        test.equal(result.statusCode, 200);
        const data = result.data;
        test.equal(data.url, '/login?' + password);
      }))

    // test fail on malformed username:password
    test.throws(function () {
      HTTP.call(
        'GET', url_prefix() + '/login?' + password,
        { auth: 'fooooo' },
        function () { throw new Error('can\'t get here'); })
    });
  }
]);

testAsyncMulti('httpcall - headers', [
  function (test, expect) {
    HTTP.call(
      'GET', url_prefix() + '/foo-with-headers',
      {
        headers: {
          'Test-header': 'Value',
          'another': 'Value2'
        }
      },
      expect(function (error, result) {
        test.equal(!!error, false);
        test.equal(!!result, true);

        test.equal(result.statusCode, 200);

        const data = result.data;
        test.equal(data.url, '/foo-with-headers');
        test.equal(data.method, 'GET');
        test.equal(data.headers['test-header'], 'Value');
        test.equal(data.headers['another'], 'Value2');
      }))

    HTTP.call(
      'GET', url_prefix() + '/headers',
      expect(function (error, result) {
        test.equal(!!error, false);
        test.equal(!!result, true);

        test.equal(result.statusCode, 201);
        test.equal(result.headers['a-silly-header'], 'Tis a');
        test.equal(result.headers['another-silly-header'], 'Silly place.');
      }))
  }
])

testAsyncMulti('httpcall - params', [
  function (test, expect) {
    const do_test = function (method, url, params, opt_opts, expect_url, expect_body) {
      let opts = {};
      if (typeof opt_opts === 'string') {
        // opt_opts omitted
        expect_body = expect_url;
        expect_url = opt_opts;
      } else {
        opts = opt_opts;
      }
      HTTP.call(
        method, url_prefix() + url,
        _.extend({ params: params }, opts),
        expect(function (error, result) {
          test.isFalse(error);
          test.isTrue(result);
          test.equal(result.statusCode, 200);
          if (method !== 'HEAD') {
            const data = result.data;
            test.equal(data.method, method);
            test.equal(data.url, expect_url);
            test.equal(data.body, expect_body, `${method} ${url} ${JSON.stringify(params)} - expect body`);
          }
        }))
    }

    do_test('GET', '/', { foo: 'bar', fruit: 'apple' }, '/?foo=bar&fruit=apple', '');
    do_test('GET', '/', { 'foo?': 'bang?' }, {}, '/?foo%3F=bang%3F', '');
    do_test('GET', '/blah', { foo: 'bar' }, '/blah?foo=bar', '');

    do_test('POST', '/', { foo: 'bar', fruit: 'apple' }, '/', 'foo=bar&fruit=apple');
    do_test('POST', '/', { 'foo?': 'bang?' }, {}, '/', 'foo%3F=bang%3F');
    do_test('POST', '/', { foo: 'bar', fruit: 'apple' }, { content: 'stuff!' }, '/?foo=bar&fruit=apple', 'stuff!');
    do_test('POST', '/', { foo: 'bar', greeting: 'Hello World' }, { content: 'stuff!' }, '/?foo=bar&greeting=Hello+World', 'stuff!');
    do_test('POST', '/foo', { foo: 'bar', greeting: 'Hello World' }, '/foo', 'foo=bar&greeting=Hello+World');

    do_test('HEAD', '/head', { foo: 'bar' }, '/head?foo=bar', '');

    do_test('PUT', '/put', { foo: 'bar' }, '/put', 'foo=bar');
  }
]);

Meteor.isClient && testAsyncMulti('httpcall - beforeSend', [
  function (test, expect) {
    let fired = false;
    const bSend = function (xhr) {
      test.isFalse(fired);
      fired = true;
      test.isTrue(xhr instanceof XMLHttpRequest);
    }

    HTTP.get(url_prefix() + '/', { beforeSend: bSend }, expect(function () {
      test.isTrue(fired);
    }));
  }
]);

if (Meteor.isServer) {
  // This is testing the server's static file sending code, not the http
  // package. It's here because it is very similar to the other tests
  // here, even though it is testing something else.
  //
  // client http library mangles paths before they are requested. only
  // run this test on the server.
  testAsyncMulti('httpcall - static file serving', [
    function (test, expect) {
      // Suppress error printing for this test (and for any other code that sets
      // the x-suppress-error header).
      WebApp._suppressExpressErrors();

      function do_test (path, code, match) {
        const prefix = Meteor.isModern
          ? '' // No prefix for web.browser (modern).
          : '/__browser.legacy';

        const options = { headers: { 'x-suppress-error': 'true' } };
        HTTP.get(url_base() + prefix + path, options, expect(function (error, result) {
          test.equal(result.statusCode, code, 'code');
          if (match) {
            test.matches(result.content, match, 'content match');
          }
        }));
      }

      // existing static file
      //do_test('/packages/local-test_http/test_static.serveme', 200, /static file serving/)

      // no such file, so return the default app HTML.
      const getsAppHtml = [
        // This file doesn't exist.
        '/nosuchfile',

        // Our static file serving doesn't process .. or its encoded version, so
        // any of these return the app HTML.
        '/../nosuchfile',
        '/%2e%2e/nosuchfile',
        '/%2E%2E/nosuchfile',
        '/%2d%2d/nosuchfile',
        '/packages/http/../http/test_static.serveme',
        '/packages/http/%2e%2e/http/test_static.serveme',
        '/packages/http/%2E%2E/http/test_static.serveme',
        '/packages/http/../../packages/http/test_static.serveme',
        '/packages/http/%2e%2e/%2e%2e/packages/http/test_static.serveme',
        '/packages/http/%2E%2E/%2E%2E/packages/http/test_static.serveme',

        // ... and they *definitely* shouldn't be able to escape the app bundle.
        '/packages/http/../../../../../../packages/http/test_static.serveme',
        '/../../../../../../../../../../../bin/ls',
        '/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/bin/ls',
        '/%2E%2E/%2E%2E/%2E%2E/%2E%2E/%2E%2E/%2E%2E/%2E%2E/%2E%2E/%2E%2E/%2E%2E/%2E%2E/bin/ls'
      ];

      _.each(getsAppHtml, function (x) {
        do_test(x, 200, /__meteor_runtime_config__ = JSON/);
      });
    }
  ]);
}

// TODO TEST/ADD:
// - full fetch api? fetch on the client?
// - https
// - cookies?
// - human-readable error reason/cause?
// - data parse error