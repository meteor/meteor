const { EventEmitter } = require("node:events");
const vm = require("node:vm");
const { loadTestPage } = require("../../../packages/test-in-console/puppeteer-bootstrap.js");

function makePage(attempts, globals = {}) {
  const page = new EventEmitter();
  page.evaluate = jest
    .fn()
    .mockImplementation((fn) => vm.runInNewContext(`(${fn.toString()})()`, globals));
  page.goto = jest.fn().mockImplementation(async () => {
    const attempt = attempts[page.goto.mock.calls.length - 1] || {};
    if (attempt.failure) {
      page.emit("requestfailed", {
        failure: () => ({ errorText: attempt.failure }),
        resourceType: () => attempt.resourceType || "script",
        url: () => attempt.url || "http://127.0.0.1:3000/packages/tinytest.js",
      });
    }
    if (attempt.error) throw attempt.error;
  });
  return page;
}

const url = "http://127.0.0.1:3000/";
const networkChanged = "net::ERR_NETWORK_CHANGED";

test("reloads once when a network change prevents the test runtime from loading", async () => {
  const page = makePage([{ failure: networkChanged }, {}]);
  const log = jest.fn();
  await loadTestPage(page, url, log);
  expect(page.goto).toHaveBeenCalledTimes(2);
  expect(log).toHaveBeenCalledWith(expect.stringContaining("before the test runtime loaded"));
  expect(page.listenerCount("requestfailed")).toBe(0);
});

test("persistent network changes fail after the second navigation", async () => {
  const page = makePage([{ failure: networkChanged }, { failure: networkChanged }]);
  await expect(loadTestPage(page, url, () => {})).rejects.toThrow(networkChanged);
  expect(page.goto).toHaveBeenCalledTimes(2);
});

test.each(["__Tinytest", "TEST_STATUS", "DONE"])(
  "never reloads when %s is already defined",
  async (name) => {
    const page = makePage([{ failure: networkChanged }], { [name]: false });
    await expect(loadTestPage(page, url, () => {})).rejects.toThrow("test runtime");
    expect(page.goto).toHaveBeenCalledTimes(1);
  },
);

test("rethrows unrelated navigation errors without reloading", async () => {
  const error = new Error("net::ERR_CONNECTION_REFUSED");
  const page = makePage([{ error }]);
  await expect(loadTestPage(page, url)).rejects.toBe(error);
  expect(page.goto).toHaveBeenCalledTimes(1);
});

test("does not retry a network change in an image", async () => {
  const page = makePage([{ failure: networkChanged, resourceType: "image" }]);
  await loadTestPage(page, url);
  expect(page.goto).toHaveBeenCalledTimes(1);
});

test("does not reinterpret script exceptions or test failures as a bootstrap failure", async () => {
  const page = makePage([{}], { TEST_STATUS: { DONE: true, FAILURES: 1 } });
  await loadTestPage(page, url);
  expect(page.goto).toHaveBeenCalledTimes(1);
  expect(page.evaluate).not.toHaveBeenCalled();
});

test("navigation errors with a confirmed network change recover before bootstrap", async () => {
  const page = makePage([
    { failure: networkChanged, resourceType: "document", error: new Error(networkChanged) },
    {},
  ]);
  await loadTestPage(page, url, () => {});
  expect(page.goto).toHaveBeenCalledTimes(2);
});

test("an unrelated navigation error is never retried even alongside a network change", async () => {
  const error = new Error("navigation timeout");
  const page = makePage([{ failure: networkChanged, error }]);
  await expect(loadTestPage(page, url)).rejects.toBe(error);
  expect(page.goto).toHaveBeenCalledTimes(1);
});

test("fails without retrying when initialization state cannot be checked", async () => {
  const page = makePage([{ failure: networkChanged }]);
  page.evaluate.mockRejectedValue(new Error("execution context destroyed"));
  await expect(loadTestPage(page, url)).rejects.toThrow("execution context destroyed");
  expect(page.goto).toHaveBeenCalledTimes(1);
});

test("does not retry failed scripts from another origin", async () => {
  const page = makePage([{ failure: networkChanged, url: "https://example.com/optional.js" }]);
  await loadTestPage(page, url);
  expect(page.goto).toHaveBeenCalledTimes(1);
});

test("a blocked renderer fails the initialization check without retrying", async () => {
  jest.useFakeTimers();
  try {
    const page = makePage([{ failure: networkChanged }]);
    page.evaluate.mockImplementation(() => new Promise(() => {}));
    const result = expect(loadTestPage(page, url)).rejects.toThrow(
      "initialization check timed out",
    );
    await jest.advanceTimersByTimeAsync(5000);
    await result;
    expect(page.goto).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});
