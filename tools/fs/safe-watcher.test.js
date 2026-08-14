const path = require("node:path").posix;

const mockUnsubscribe = jest.fn(async () => {});
const mockSubscribe = jest.fn(async () => ({ unsubscribe: mockUnsubscribe }));
const mockWatchFile = jest.fn();
const mockUnwatchFile = jest.fn();

jest.mock(
  "@parcel/watcher",
  () => ({
    __esModule: true,
    default: { subscribe: mockSubscribe },
  }),
  { virtual: true },
);

jest.mock("./safe-watcher-legacy", () => ({
  watch: jest.fn(),
  addWatchRoot: jest.fn(),
  closeAllWatchers: jest.fn(),
}));

jest.mock("../tool-env/profile", () => ({
  Profile: (_name, fn) => fn,
}));

jest.mock("../tool-env/meteor-config", () => ({
  getMeteorConfig: () => ({ modern: { watcher: true } }),
}));

jest.mock("./files", () => ({
  statOrNull: (filePath) => ({
    isDirectory: () => !filePath.endsWith(".js"),
  }),
  lstat: () => ({ isSymbolicLink: () => false }),
  toPosixPath: (filePath) => filePath,
  convertToOSPath: (filePath) => filePath,
  pathRelative: path.relative,
  watchFile: mockWatchFile,
  unwatchFile: mockUnwatchFile,
  pathResolve: path.resolve,
  pathDirname: path.dirname,
  pathJoin: path.join,
  getHomeDir: () => "/home/tester",
  getCurrentToolsDir: () => "/checkout",
  inCheckout: () => false,
}));

delete process.env.METEOR_WAREHOUSE_DIR;

const safeWatcher = require("./safe-watcher.ts");

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

afterAll(async () => {
  await safeWatcher.closeAllWatchers();
});

test("does not create native subscriptions for immutable warehouse packages", async () => {
  const appCallback = jest.fn();
  safeWatcher.watch("/home/tester/.meteor/packages/ddp-client/3.3.0/os/client.js", jest.fn());
  safeWatcher.watch("/app/imports/main.js", appCallback);

  await flushPromises();

  expect(mockSubscribe).toHaveBeenCalledTimes(1);
  expect(mockSubscribe.mock.calls[0][0]).toBe("/app/imports");
  expect(mockWatchFile).not.toHaveBeenCalled();

  const parcelCallback = mockSubscribe.mock.calls[0][1];
  parcelCallback(null, [{ path: "/app/imports/main.js", type: "update" }]);
  expect(appCallback).toHaveBeenCalledWith("change");
});
