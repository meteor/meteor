Tinytest.add("absolute-url - basics", function(test) {

  test.equal(Meteor.absoluteUrl({rootUrl: 'http://asdf.com'}),
             'http://asdf.com/');
  test.equal(Meteor.absoluteUrl(undefined, {rootUrl: 'http://asdf.com'}),
             'http://asdf.com/');
  test.equal(Meteor.absoluteUrl(undefined, {rootUrl: 'http://asdf.com/'}),
             'http://asdf.com/');

  test.equal(Meteor.absoluteUrl('foo', {rootUrl: 'http://asdf.com/'}),
             'http://asdf.com/foo');
  test.equal(Meteor.absoluteUrl('/foo', {rootUrl: 'http://asdf.com'}),
             'http://asdf.com//foo');
  test.equal(Meteor.absoluteUrl('#foo', {rootUrl: 'http://asdf.com'}),
             'http://asdf.com/#foo');

  test.equal(Meteor.absoluteUrl('foo', {rootUrl: 'http://asdf.com',
                                        secure: true}),
             'https://asdf.com/foo');
  test.equal(Meteor.absoluteUrl('foo', {rootUrl: 'https://asdf.com',
                                        secure: true}),
             'https://asdf.com/foo');
  test.equal(Meteor.absoluteUrl('foo', {rootUrl: 'https://asdf.com',
                                        secure: false}),
             'https://asdf.com/foo');

  test.equal(Meteor.absoluteUrl('foo', {rootUrl: 'http://localhost',
                                        secure: true}),
             'http://localhost/foo');
  test.equal(Meteor.absoluteUrl('foo', {rootUrl: 'http://localhost:3000',
                                        secure: true}),
             'http://localhost:3000/foo');
  test.equal(Meteor.absoluteUrl('foo', {rootUrl: 'https://localhost:3000',
                                        secure: true}),
             'https://localhost:3000/foo');
  test.equal(Meteor.absoluteUrl('foo', {rootUrl: 'http://127.0.0.1:3000',
                                        secure: true}),
             'http://127.0.0.1:3000/foo');
});


Tinytest.add("absolute-url - environment", function(test) {
  // make sure our test runner set the runtime configuration, and this
  // propagates to the client.
  test.isTrue(/^http/.test(__meteor_runtime_config__.ROOT_URL));
});
