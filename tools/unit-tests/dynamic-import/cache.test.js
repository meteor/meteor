const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.resolve(
  __dirname, '../../../packages/dynamic-import/cache.js'
), 'utf8');

describe('dynamic-import IndexedDB error diagnostics', () => {
  let cache;

  beforeEach(() => {
    cache = vm.createContext({ Meteor: { isClient: false }, exports: {} });
    vm.runInContext(source, cache);
  });

  test('preserves the name and message of non-enumerable request errors', () => {
    // IDBRequest.error and DOMException details live on prototypes and do
    // not appear in JSON.stringify(request).
    const request = Object.create({
      error: new DOMException('The transaction was aborted.', 'AbortError')
    });
    const reject = jest.fn();
    cache.makeOnError(reject, 'sourcesByVersion.put')({ target: request });
    expect(reject.mock.calls[0][0].message).toContain(
      'sourcesByVersion.put AbortError: The transaction was aborted.'
    );
  });

  test('still rejects when the request has no error details', () => {
    const reject = jest.fn();
    cache.makeOnError(reject, 'indexedDB.open')({ target: { error: null } });
    expect(reject).toHaveBeenCalledTimes(1);
    expect(reject.mock.calls[0][0].message).toContain('indexedDB.open Unknown error');
  });
});
