const path = require("node:path").posix;

const mockUnsubscribe = jest.fn(async () => {});
const mockSubscribe = jest.fn(async () => ({ unsubscribe: mockUnsubscribe }));
const mockWatchFile = jest.fn();
const mockUnwatchFile = jest.fn();
let mockIsCheckout = false;
let mockMissingDirectory = false;

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
  statOrNull: (filePath) =>
    mockMissingDirectory && filePath === "/app/imports"
      ? null
      : { isDirectory: () => !filePath.endsWith(".js") },
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
  mockMissingDirectory = false;
  delete process.env.METEOR_WAREHOUSE_DIR;
  mockSubscribe.mockReset();
  mockSubscribe.mockResolvedValue({ unsubscribe: mockUnsubscribe });
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

test("treats a missing path during root subscription as transient", async () => {
  const missingPathError = new Error(
    "inotify_add_watch failed: No such file or directory",
  );
  const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  mockSubscribe.mockRejectedValueOnce(missingPathError);

  try {
    watch("/app/imports/main.js");
    await flushPromises();

    expect(consoleError).not.toHaveBeenCalled();

    watch("/app/imports/other.js");
    await flushPromises();

    expect(mockSubscribe).toHaveBeenCalledTimes(2);
  } finally {
    consoleError.mockRestore();
  }
});

test("retries a missing root for an existing watch entry", async () => {
  const missingPathError = Object.assign(new Error("root disappeared"), {
    code: "ENOENT",
  });
  const callback = jest.fn();
  mockSubscribe.mockRejectedValueOnce(missingPathError);
  jest.useFakeTimers({ doNotFake: ["setImmediate"] });

  try {
    watch("/app/imports/main.js", callback);
    await flushPromises();

    expect(mockSubscribe).toHaveBeenCalledTimes(1);
    expect(mockWatchFile).not.toHaveBeenCalled();

    await jest.runOnlyPendingTimersAsync();

    expect(mockSubscribe).toHaveBeenCalledTimes(2);

    const parcelCallback = mockSubscribe.mock.calls[1][1];
    parcelCallback(null, [{ path: "/app/imports/main.js", type: "update" }]);
    expect(callback).toHaveBeenCalledWith("change");
  } finally {
    jest.useRealTimers();
  }
});

test("keeps retrying while the root remains missing", async () => {
  const missingPathError = Object.assign(new Error("root disappeared"), {
    code: "ENOENT",
  });
  mockSubscribe.mockRejectedValueOnce(missingPathError);
  jest.useFakeTimers({ doNotFake: ["setImmediate"] });

  try {
    watch("/app/imports/main.js");
    await flushPromises();

    mockMissingDirectory = true;
    await jest.runOnlyPendingTimersAsync();

    expect(mockSubscribe).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(1);

    mockMissingDirectory = false;
    await jest.runOnlyPendingTimersAsync();

    expect(mockSubscribe).toHaveBeenCalledTimes(2);
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});

test("cancels a missing-root retry when its last entry closes", async () => {
  const missingPathError = Object.assign(new Error("root disappeared"), {
    code: "ENOENT",
  });
  mockSubscribe.mockRejectedValueOnce(missingPathError);
  jest.useFakeTimers({ doNotFake: ["setImmediate"] });

  try {
    const watcher = watch("/app/imports/main.js");
    await flushPromises();

    expect(jest.getTimerCount()).toBe(1);

    watcher.close();

    expect(jest.getTimerCount()).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});

test("reports unexpected root subscription failures", async () => {
  const subscriptionError = new Error("watcher backend failed");
  const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  mockSubscribe.mockRejectedValueOnce(subscriptionError);

  try {
    watch("/app/imports/main.js");
    await flushPromises();

    expect(consoleError).toHaveBeenCalledWith(
      "Failed to start watcher for /app/imports:",
      subscriptionError,
    );
  } finally {
    consoleError.mockRestore();
  }
});
