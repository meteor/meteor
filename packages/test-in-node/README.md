# test-in-node

Run Meteor package tests with the Node.js native test runner (`node:test`).
Server-side, zero dependencies, opt-in. Tinytest is untouched.

```bash
meteor test-packages my-package --driver-package test-in-node --once
```

Write tests as standard Node tests, in **server-only** files:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Random } from 'meteor/random';

describe('my-package', () => {
  it('generates unique ids', () => {
    assert.notStrictEqual(Random.id(), Random.id());
  });
});
```

```js
// package.js
Package.onTest(function (api) {
  api.use(['my-package', 'ecmascript'], 'server');
  api.addFiles('my-package-tests.js', 'server'); // server-only — see note below
});
```

The driver's `node:test` reporter is **wired automatically** by the Meteor tool when
you pass `--driver-package test-in-node`. No `SERVER_NODE_OPTIONS` needed.

> **Server-only:** test files using `node:test` must be added with the `'server'`
> arch (`api.addFiles('tests.js', 'server')`). `node:test` is a Node API, and isobuild
> only passes `node:` imports through on the server architecture.

## What you get

Standard `node:test`: `describe`/`it`, `node:assert/strict`, async tests, `it.skip`,
`it.todo`, nested suites — all from Node core, zero extra dependencies. The runner
reports a compact pass/fail/skip/todo summary and exits non-zero if any test fails.

## Node version note

The driver relies on `node:test`'s `test:complete` event (Node ≥ 20.13). Inside
Meteor this is always satisfied — the server runs on the release's dev-bundle
Node (24.x on devel, 22.x on the 3.5 line). The floor only matters if you load
`driver.js` in plain Node during development.
