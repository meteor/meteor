Tinytest.add("absolute-url - basics", function(test) {
  ['', 'http://'].forEach(function (prefix) {

    test.equal(Meteor.absoluteUrl({rootUrl: prefix + 'asdf.com'}),
               'http://asdf.com/');
    test.equal(Meteor.absoluteUrl(undefined, {rootUrl: prefix + 'asdf.com'}),
               'http://asdf.com/');
    test.equal(Meteor.absoluteUrl(undefined, {rootUrl: prefix + 'asdf.com/'}),
               'http://asdf.com/');

    test.equal(Meteor.absoluteUrl('foo', {rootUrl: prefix + 'asdf.com/'}),
               'http://asdf.com/foo');
    test.equal(Meteor.absoluteUrl('/foo', {rootUrl: prefix + 'asdf.com'}),
               'http://asdf.com/foo');
    test.equal(Meteor.absoluteUrl('#foo', {rootUrl: prefix + 'asdf.com'}),
               'http://asdf.com/#foo');

    test.equal(Meteor.absoluteUrl('foo', {rootUrl: prefix + 'asdf.com',
                                          secure: true}),
               'https://asdf.com/foo');
    test.equal(Meteor.absoluteUrl('foo', {rootUrl: 'https://asdf.com',
                                          secure: true}),
               'https://asdf.com/foo');
    test.equal(Meteor.absoluteUrl('foo', {rootUrl: 'https://asdf.com',
                                          secure: false}),
               'https://asdf.com/foo');

    test.equal(Meteor.absoluteUrl('foo', {rootUrl: prefix + 'localhost',
                                          secure: true}),
               'http://localhost/foo');
    test.equal(Meteor.absoluteUrl('foo', {rootUrl: prefix + 'localhost:3000',
                                          secure: true}),
               'http://localhost:3000/foo');
    test.equal(Meteor.absoluteUrl('foo', {rootUrl: 'https://localhost:3000',
                                          secure: true}),
               'https://localhost:3000/foo');
    test.equal(Meteor.absoluteUrl('foo', {rootUrl: prefix + '127.0.0.1:3000',
                                          secure: true}),
               'http://127.0.0.1:3000/foo');

    // test replaceLocalhost
    test.equal(Meteor.absoluteUrl('foo', {rootUrl: prefix + 'localhost:3000',
                                          replaceLocalhost: true}),
               'http://127.0.0.1:3000/foo');
    test.equal(Meteor.absoluteUrl('foo', {rootUrl: prefix + 'localhost',
                                          replaceLocalhost: true}),
               'http://127.0.0.1/foo');
    test.equal(Meteor.absoluteUrl('foo', {rootUrl: prefix + '127.0.0.1:3000',
                                          replaceLocalhost: true}),
               'http://127.0.0.1:3000/foo');
    test.equal(Meteor.absoluteUrl('foo', {rootUrl: prefix + '127.0.0.1',
                                          replaceLocalhost: true}),
               'http://127.0.0.1/foo');
    // don't replace just any localhost
    test.equal(Meteor.absoluteUrl('foo', {rootUrl: prefix + 'foo.com/localhost',
                                          replaceLocalhost: true}),
               'http://foo.com/localhost/foo');
    test.equal(Meteor.absoluteUrl('foo', {rootUrl: prefix + 'foo.localhost.com',
                                          replaceLocalhost: true}),
               'http://foo.localhost.com/foo');
  });
});


Tinytest.add("absolute-url - environment", function(test) {
  // make sure our test runner set the runtime configuration, and this
  // propagates to the client.
  test.isTrue(/^http/.test(__meteor_runtime_config__.ROOT_URL));
});
