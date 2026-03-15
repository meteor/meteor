import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import RoutePolicy from 'meteor/routepolicy/routepolicy';

describe('routepolicy', () => {
  it('declare and classify', () => {
    const policy = new RoutePolicy();

    policy.declare('/sockjs/', 'network');
    policy.declare('/bigphoto.jpg', 'static-online');
    policy.declare('/anotherphoto.png', 'static-online');

    assert.strictEqual(policy.classify('/'), null);
    assert.strictEqual(policy.classify('/foo'), null);
    assert.strictEqual(policy.classify('/sockjs'), null);

    assert.strictEqual(policy.classify('/sockjs/'), 'network');
    assert.strictEqual(policy.classify('/sockjs/foo'), 'network');

    assert.strictEqual(policy.classify('/bigphoto.jpg'), 'static-online');
    assert.strictEqual(policy.classify('/bigphoto.jpg.orig'), 'static-online');

    assert.deepStrictEqual(policy.urlPrefixesFor('network'), ['/sockjs/']);
    assert.deepStrictEqual(
      policy.urlPrefixesFor('static-online'),
      ['/anotherphoto.png', '/bigphoto.jpg']
    );
  });

  it('static conflicts', () => {
    const manifest = [
      {
        "path": "static/sockjs/socks-are-comfy.jpg",
        "type": "static",
        "where": "client",
        "url": "/sockjs/socks-are-comfy.jpg"
      },
      {
        "path": "static/bigphoto.jpg",
        "type": "static",
        "where": "client",
        "url": "/bigphoto.jpg"
      }
    ];
    const policy = new RoutePolicy();

    assert.strictEqual(
      policy.checkForConflictWithStatic('/sockjs/', 'network', manifest),
      "static resource /sockjs/socks-are-comfy.jpg conflicts with network route /sockjs/"
    );

    assert.strictEqual(
      policy.checkForConflictWithStatic('/bigphoto.jpg', 'static-online', manifest),
      null
    );
  });

  it('checkUrlPrefix', () => {
    const policy = new RoutePolicy();
    policy.declare('/sockjs/', 'network');

    assert.strictEqual(
      policy.checkUrlPrefix('foo/bar', 'network'),
      "a route URL prefix must begin with a slash"
    );

    assert.strictEqual(
      policy.checkUrlPrefix('/', 'network'),
      "a route URL prefix cannot be /"
    );

    assert.strictEqual(
      policy.checkUrlPrefix('/sockjs/', 'static-online'),
      "the route URL prefix /sockjs/ has already been declared to be of type network"
    );
  });
});
