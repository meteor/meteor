const vm = require('vm');
const { BlazeTemplatesPlugin } = require('./BlazeTemplatesPlugin');

function createChunkHandler(globals = {}) {
  let runtimeModule;
  class RuntimeModule {
    static STAGE_ATTACH = 10;
  }

  new BlazeTemplatesPlugin({
    projectDir: '/app',
    filePath: '_build/main-dev/client-blaze.js',
  }).apply({
    webpack: {
      RuntimeGlobals: { ensureChunkHandlers: '__webpack_require__.f' },
      RuntimeModule,
    },
    hooks: {
      thisCompilation: {
        tap(name, callback) {
          callback({
            hooks: {
              runtimeRequirementInTree: {
                for: () => ({ tap: (name, add) => add({}) }),
              },
            },
            addRuntimeModule(chunk, module) {
              runtimeModule = module;
            },
          });
        },
      },
      done: { tap() {} },
    },
  });

  const context = { ...globals, __webpack_require__: { f: {} } };
  vm.runInNewContext(runtimeModule.generate(), context);
  return context.__webpack_require__.f.blaze;
}

test('leaves worker chunk loading alone when Meteor require is absent', () => {
  const handler = createChunkHandler();
  const chunkDownload = Promise.resolve();
  const promises = [chunkDownload];

  expect(() => handler('heavy_js', promises)).not.toThrow();
  expect(promises).toEqual([chunkDownload]);
});

test('waits for lazy templates in the app runtime', async () => {
  let finishLoading;
  const templates = new Promise(resolve => { finishLoading = resolve; });
  const load = jest.fn(chunkId => chunkId === 'route_js' ? templates : undefined);
  const meteorRequire = jest.fn(() => ({ load }));
  const handler = createChunkHandler({ require: meteorRequire });
  const chunkDownload = Promise.resolve();
  const promises = [chunkDownload];

  handler('route_js', promises);

  expect(meteorRequire).toHaveBeenCalledWith('/_build/main-dev/client-blaze.js');
  expect(load).toHaveBeenCalledWith('route_js');
  expect(promises).toEqual([chunkDownload, templates]);
  finishLoading();
  await Promise.all(promises);

  const withoutTemplates = [];
  handler('plain_js', withoutTemplates);
  expect(withoutTemplates).toEqual([]);
});
