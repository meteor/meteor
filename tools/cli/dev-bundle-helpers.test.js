const mockBatchInstallNpmModules = jest.fn();
const mockReadFile = jest.fn();
const mockStatOrNull = jest.fn();

jest.mock("../fs/files", () => ({
  getDevBundle: () => "/dev-bundle",
  pathJoin: (...parts) => parts.join("/"),
  readFile: (...args) => mockReadFile(...args),
  statOrNull: (...args) => mockStatOrNull(...args),
}));

jest.mock("../isobuild/meteor-npm.js", () => ({
  batchInstallNpmModules: (...args) => mockBatchInstallNpmModules(...args),
}));

import { ensureDependencies } from "./dev-bundle-helpers.js";

describe("ensureDependencies", () => {
  beforeEach(() => {
    mockBatchInstallNpmModules.mockReset();
    mockReadFile.mockReset();
    mockStatOrNull.mockReset();
  });

  it("reinstalls a dependency when the requested version differs", async () => {
    mockStatOrNull.mockReturnValue({ isDirectory: () => true });
    mockReadFile.mockReturnValue(JSON.stringify({ version: "13.2.0" }));

    await ensureDependencies({ puppeteer: "25.9.0" }, { reinstallOnVersionMismatch: true });

    expect(mockBatchInstallNpmModules).toHaveBeenCalledWith(
      { puppeteer: "25.9.0" },
      "/dev-bundle/lib",
    );
  });
});
