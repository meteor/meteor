const path = require("node:path").posix;

const mockUnsubscribe = jest.fn(async () => {});
const mockSubscribe = jest.fn(async () => ({ unsubscribe: mockUnsubscribe }));
const mockWatchFile = jest.fn();
const mockUnwatchFile = jest.fn();
let mockIsCheckout = false;

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
  inCheckout: () => mockIsCheckout,
}));

const originalWarehouseDir = process.env.METEOR_WAREHOUSE_DIR;

const safeWatcher = require("./safe-watcher.ts");

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));
const activeWatchers = [];

const watch = (filePath, callback = jest.fn()) => {
  const watcher = safeWatcher.watch(filePath, callback);
  activeWatchers.push(watcher);
  return watcher;
};

beforeEach(() => {
  mockIsCheckout = false;
  delete process.env.METEOR_WAREHOUSE_DIR;
  mockSubscribe.mockClear();
  mockUnsubscribe.mockClear();
  mockWatchFile.mockClear();
  mockUnwatchFile.mockClear();
});

afterEach(async () => {
  activeWatchers.splice(0).forEach((watcher) => watcher.close());
  await safeWatcher.closeAllWatchers();
});

afterAll(async () => {
  try {
    await safeWatcher.closeAllWatchers();
  } finally {
    if (originalWarehouseDir === undefined) {
      delete process.env.METEOR_WAREHOUSE_DIR;
    } else {
      process.env.METEOR_WAREHOUSE_DIR = originalWarehouseDir;
    }
  }
});

test("ignores default package warehouse roots and watches app files", async () => {
  const appCallback = jest.fn();
  watch("/home/tester/.meteor/packages/ddp-client/3.3.0/os/client.js");
  watch("/home/tester/.meteor/packages-from-server/example.com/ddp-client/3.3.0/os/client.js");
  watch("/app/imports/main.js", appCallback);

  await flushPromises();

  expect(mockSubscribe).toHaveBeenCalledTimes(1);
  expect(mockSubscribe.mock.calls[0][0]).toBe("/app/imports");
  expect(mockWatchFile).not.toHaveBeenCalled();

  const parcelCallback = mockSubscribe.mock.calls[0][1];
  parcelCallback(null, [{ path: "/app/imports/main.js", type: "update" }]);
  expect(appCallback).toHaveBeenCalledWith("change");
});

test("ignores the checkout warehouse and watches checkout package sources", async () => {
  mockIsCheckout = true;

  watch("/checkout/.meteor/packages/ddp-client/3.3.0/os/client.js");
  watch("/checkout/.meteor/packages-from-server/example.com/ddp-client/3.3.0/os/client.js");
  watch("/checkout/packages/ddp-client/client/client.js");

  await flushPromises();

  expect(mockSubscribe).toHaveBeenCalledTimes(1);
  expect(mockSubscribe.mock.calls[0][0]).toBe("/checkout/packages/ddp-client/client");
  expect(mockWatchFile).not.toHaveBeenCalled();
});

test("honors METEOR_WAREHOUSE_DIR and watches local packages", async () => {
  mockIsCheckout = true;
  process.env.METEOR_WAREHOUSE_DIR = "/custom/warehouse";

  watch("/custom/warehouse/packages/ddp-client/3.3.0/os/client.js");
  watch("/custom/warehouse/packages-from-server/example.com/ddp-client/3.3.0/os/client.js");
  watch("/app/packages/local-package/client/client.js");

  await flushPromises();

  expect(mockSubscribe).toHaveBeenCalledTimes(1);
  expect(mockSubscribe.mock.calls[0][0]).toBe("/app/packages/local-package/client");
  expect(mockWatchFile).not.toHaveBeenCalled();
});
