const mockEnsureDependencies = jest.fn();
const mockExecFile = jest.fn();
const mockExecutablePath = jest.fn();
const mockMkdirSync = jest.fn();
const mockRmSync = jest.fn();
const mockStatOrNull = jest.fn();
const mockUtimesSync = jest.fn();

jest.mock("child_process", () => ({
  execFile: (...args) => mockExecFile(...args),
}));

jest.mock("fs", () => ({
  mkdirSync: (...args) => mockMkdirSync(...args),
  rmSync: (...args) => mockRmSync(...args),
  utimesSync: (...args) => mockUtimesSync(...args),
}));

jest.mock("../../client.js", () => ({
  __esModule: true,
  default: class Client {
    constructor(options) {
      Object.assign(this, options);
    }
  },
}));

jest.mock("../../../utils/buildmessage.js", () => ({
  enterJob: (_options, callback) => callback(),
}));

jest.mock("../../../cli/dev-bundle-helpers.js", () => ({
  ensureDependencies: (...args) => mockEnsureDependencies(...args),
}));

jest.mock("../../../fs/files", () => ({
  getDevBundle: () => "/dev-bundle",
  pathJoin: (...parts) => parts.join("/"),
  statOrNull: (...args) => mockStatOrNull(...args),
}));

jest.mock(
  "puppeteer",
  () => ({
    executablePath: (...args) => mockExecutablePath(...args),
  }),
  { virtual: true },
);

import PuppeteerClient from "./index.js";

describe("PuppeteerClient", () => {
  beforeEach(() => {
    mockEnsureDependencies.mockReset().mockResolvedValue(undefined);
    mockExecFile
      .mockReset()
      .mockImplementation((_executable, _args, _options, callback) => callback(null, "", ""));
    mockExecutablePath.mockReset().mockImplementation(() => {
      throw new Error("Chrome is not installed");
    });
    mockMkdirSync.mockReset();
    mockRmSync.mockReset();
    mockStatOrNull.mockReset().mockReturnValue(null);
    mockUtimesSync.mockReset();
  });

  it("runs the awaited browser installer when Chrome is unavailable", async () => {
    mockExecutablePath
      .mockReset()
      .mockRejectedValueOnce(new Error("Chrome is not installed"))
      .mockRejectedValueOnce(new Error("Chrome is not installed"))
      .mockResolvedValue("/cache/chrome");
    mockStatOrNull.mockImplementation((path) =>
      path === "/cache/chrome" ? { isFile: () => true } : null,
    );
    const client = new PuppeteerClient({ host: "localhost", port: 3000 });

    await client.init();

    expect(mockExecFile).toHaveBeenCalledWith(
      process.execPath,
      ["/dev-bundle/lib/node_modules/puppeteer/install.mjs"],
      expect.objectContaining({
        env: expect.objectContaining({
          PUPPETEER_CACHE_DIR: expect.any(String),
          PUPPETEER_SKIP_CHROME_HEADLESS_SHELL_DOWNLOAD: "true",
        }),
      }),
      expect.any(Function),
    );
    expect(mockExecFile).toHaveBeenCalledWith(
      "/cache/chrome",
      ["--version"],
      expect.objectContaining({ timeout: expect.any(Number) }),
      expect.any(Function),
    );
    expect(mockMkdirSync).toHaveBeenCalledWith(expect.stringContaining(".lock"));
    expect(mockRmSync).toHaveBeenCalledWith(
      expect.stringContaining("puppeteer-chrome-cache-25.9.0"),
      { force: true, recursive: true },
    );
    expect(mockExecutablePath).toHaveBeenCalledTimes(3);
  });

  it("accepts the asynchronous executable path returned by Puppeteer 25", async () => {
    mockExecutablePath.mockReset().mockResolvedValue("/cache/chrome");
    mockStatOrNull.mockImplementation((path) =>
      path === "/cache/chrome" ? { isFile: () => true } : null,
    );
    const client = new PuppeteerClient({ host: "localhost", port: 3000 });

    await client.init();

    expect(mockExecFile).toHaveBeenCalledTimes(1);
    expect(mockExecFile).toHaveBeenCalledWith(
      "/cache/chrome",
      ["--version"],
      expect.objectContaining({ timeout: expect.any(Number) }),
      expect.any(Function),
    );
    expect(mockExecFile).not.toHaveBeenCalledWith(
      process.execPath,
      expect.arrayContaining([expect.stringContaining("install.mjs")]),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("waits for an existing install lock before accepting the browser", async () => {
    const lockExists = new Error("lock exists");
    lockExists.code = "EEXIST";
    mockMkdirSync.mockImplementationOnce(() => {
      throw lockExists;
    });
    mockExecutablePath
      .mockReset()
      .mockRejectedValueOnce(new Error("Chrome is not installed"))
      .mockResolvedValue("/cache/chrome");
    mockStatOrNull.mockImplementation((path) =>
      path === "/cache/chrome" ? { isFile: () => true } : { mtimeMs: Date.now() },
    );
    const client = new PuppeteerClient({ host: "localhost", port: 3000 });

    await client.init();

    expect(mockMkdirSync).toHaveBeenCalledTimes(2);
    expect(mockExecutablePath).toHaveBeenCalledTimes(2);
    expect(mockRmSync).toHaveBeenCalledWith(expect.stringContaining(".lock"), {
      force: true,
      recursive: true,
    });
  });

  it("recovers an install lock whose heartbeat is stale", async () => {
    const lockExists = new Error("lock exists");
    lockExists.code = "EEXIST";
    let staleLockRemoved = false;
    mockMkdirSync.mockImplementation(() => {
      if (!staleLockRemoved) {
        throw lockExists;
      }
    });
    mockRmSync.mockImplementation((path) => {
      if (path.endsWith(".lock")) {
        staleLockRemoved = true;
      }
    });
    mockExecutablePath
      .mockReset()
      .mockRejectedValueOnce(new Error("Chrome is not installed"))
      .mockRejectedValueOnce(new Error("Chrome is not installed"))
      .mockResolvedValue("/cache/chrome");
    mockStatOrNull.mockImplementation((path) => {
      if (path.endsWith(".lock")) {
        return { mtimeMs: Date.now() - 3 * 60 * 1000 };
      }
      return path === "/cache/chrome" ? { isFile: () => true } : null;
    });
    const client = new PuppeteerClient({ host: "localhost", port: 3000 });

    await client.init();

    expect(staleLockRemoved).toBe(true);
    expect(mockMkdirSync).toHaveBeenCalledTimes(2);
    expect(mockRmSync).toHaveBeenCalledWith(expect.stringContaining(".lock"), {
      force: true,
      recursive: true,
    });
  });

  it("fails initialization when the installer produces no executable", async () => {
    const client = new PuppeteerClient({ host: "localhost", port: 3000 });

    await expect(client.init()).rejects.toThrow(
      "Chrome for Puppeteer is unavailable after installation",
    );
  });

  it("rejects an executable that cannot answer --version", async () => {
    mockExecutablePath.mockReset().mockResolvedValue("/cache/chrome");
    mockStatOrNull.mockReturnValue({ isFile: () => true });
    mockExecFile.mockImplementation((executable, _args, _options, callback) => {
      if (executable === "/cache/chrome") {
        callback(new Error("bad executable"));
      } else {
        callback(null, "", "");
      }
    });
    const client = new PuppeteerClient({ host: "localhost", port: 3000 });

    await expect(client.init()).rejects.toThrow(
      "Chrome for Puppeteer is unavailable after installation",
    );
    expect(mockRmSync).toHaveBeenCalledWith(
      expect.stringContaining("puppeteer-chrome-cache-25.9.0"),
      { force: true, recursive: true },
    );
  });
});
