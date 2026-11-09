const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");
const test = require("node:test");

function backend({ exists = () => true } = {}) {
  const reads = [];
  const logs = [];
  const context = {
    Buffer, console: { error: (...args) => logs.push(args.join(" ")) },
    dynamicImportInfo: { "web.browser": { dynamicRoot: "/virtual/dynamic" }, server: { dynamicRoot: "/virtual/server" } },
    Package: { webapp: { WebAppInternals: { meteorInternalHandlers: { use() {} } }, WebApp: { categorizeRequest: () => ({ arch: "web.browser" }) } } },
    require(name) {
      if (name === "fs") return { readFileSync(filename) {
        reads.push(filename);
        if (!exists(filename)) throw Object.assign(new Error("ENOENT: no such file or directory, open '" + filename + "'"), { code: "ENOENT" });
        return "function (require, exports, module) {}";
      } };
      if (name === "./client.js") return { setSecretKey() {} };
      if (name === "./security.js") return {};
      if (name === "meteor/meteor") return { Meteor: { startup: fn => fn(), isDevelopment: true } };
      if (name === "meteor/inter-process-messaging") return { onMessage() {} };
      return require(name.startsWith("./") ? path.join(__dirname, name) : name);
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"), context);
  function post(body, query = {}) {
    const req = Object.assign(new EventEmitter(), { method: "POST", headers: {}, query });
    const res = { setHeader() {}, writeHead(status) { this.status = status; }, end(body) { this.body = body; } };
    context.middleware(req, res);
    req.emit("data", Buffer.from(body));
    req.emit("end");
    return res;
  }
  return { post, reads, logs, context };
}

async function fetchIds(ids, { cached = {}, secret = false } = {}) {
  const server = backend();
  const install = {};
  const requests = [];
  let cacheWrites = {};
  function Module() {}
  const exports = {};
  const context = {
    module: { constructor: Module }, exports, global: {},
    Meteor: { settings: {}, absoluteUrl: url => url },
    require(name) {
      if (name === "meteor/modules") return { meteorInstall: install };
      if (name === "./cache.js") return { checkMany: () => Promise.resolve(cached), setMany(values) { cacheWrites = values; } };
      if (name === "./dynamic-versions.js") return { get: id => Object.hasOwn(cached, id) ? "compiled-version" : null };
      return require(path.join(__dirname, name));
    },
    fetch(url, options) {
      const res = server.post(options.body, secret ? { key: server.context.dynamicImportInfo.server.key } : {});
      requests.push({ body: options.body, status: res.status, url });
      return Promise.resolve({ ok: res.status === 200, status: res.status, json: async () => JSON.parse(res.body) });
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "client.js"), "utf8"), context);
  if (secret) exports.setSecretKey(server.context.dynamicImportInfo.server.key);
  const tree = await install.fetch(ids);
  return { tree, requests, server, cacheWrites };
}

function siblings(count, prefix = "/imports/") {
  return Object.fromEntries(Array.from({ length: count }, (_, i) => [prefix + "module-" + i + ".js", { options: {} }]));
}

test("1001 uncached sibling modules are fetched completely in bounded requests", async () => {
  const result = await fetchIds(siblings(1001));
  assert.equal(Object.keys(result.tree.imports).length, 1001);
  assert.equal(result.server.reads.length, 1001);
  assert.equal(result.requests.length, 2);
  assert.equal(result.requests.every(r => r.status === 200), true);
});

test("a small graph still uses one request", async () => {
  const result = await fetchIds(siblings(999));
  assert.equal(result.requests.length, 1);
  assert.equal(Object.keys(result.tree.imports).length, 999);
});

test("total node limits partition separate directories without losing modules", async () => {
  const ids = {};
  for (let folder = 0; folder < 11; folder++) Object.assign(ids, siblings(999, "/imports/folder-" + folder + "/"));
  const result = await fetchIds(ids);
  assert.equal(result.server.reads.length, 10989);
  assert.equal(result.requests.length > 1, true);
  assert.equal(result.requests.every(r => r.status === 200), true);
});

test("UTF8 JSON body size is bounded independently of key and node counts", async () => {
  const ids = Object.fromEntries(Array.from({ length: 1600 }, (_, i) => ["/imports/folder-" + Math.floor(i / 800) + "/" + i + "é".repeat(450) + ".js", { options: {} }]));
  const result = await fetchIds(ids);
  assert.equal(result.server.reads.length, 1600);
  assert.equal(result.requests.every(r => Buffer.byteLength(r.body) <= 1024 * 1024 && r.status === 200), true);
});

test("escaped and supplementary Unicode names use actual JSON UTF8 accounting", async () => {
  const ids = Object.fromEntries(Array.from({ length: 2400 }, (_, i) => ["/imports/folder-" + Math.floor(i / 800) + "/" + i + "\n".repeat(500) + "😀.js", { options: {} }]));
  const result = await fetchIds(ids);
  assert.equal(result.server.reads.length, 2400);
  assert.equal(result.requests.every(r => Buffer.byteLength(r.body) <= 1024 * 1024 && r.status === 200), true);
});

test("compiled cold-cache versions are recorded for all merged batches", async () => {
  const ids = siblings(1001);
  const cached = Object.fromEntries(Object.keys(ids).map(id => [id, null]));
  const result = await fetchIds(ids, { cached });
  assert.equal(Object.keys(result.cacheWrites).length, 1001);
  assert.equal(result.cacheWrites["/imports/module-1000.js"].version, "compiled-version");
  assert.equal(result.requests.length, 2);
});

test("cached modules and server secret routing survive response merging", async () => {
  const ids = siblings(1001);
  ids["/cached.js"] = { options: {} };
  const result = await fetchIds(ids, { cached: { "/cached.js": "function (require, exports, module) {}" }, secret: true });
  assert.equal(typeof result.tree["cached.js"], "function");
  assert.equal(Object.keys(result.tree.imports).length, 1001);
  assert.equal(result.server.reads.every(p => p.startsWith("/virtual/server/")), true);
  assert.equal(result.requests.every(r => r.url.includes("key=")), true);
});

test("server still rejects oversized, deep, and malformed requests before reading", () => {
  const server = backend();
  assert.equal(server.post(JSON.stringify({ imports: Object.fromEntries(Array.from({ length: 1001 }, (_, i) => ["m" + i, 1])) })).status, 400);
  let deep = 1;
  for (let i = 0; i < 65; i++) deep = { d: deep };
  for (const body of [deep, { "..": 1 }, { "a/b": 1 }, { "a\\b": 1 }, { m: true }, []]) assert.equal(server.post(JSON.stringify(body)).status, 400);
  assert.equal(server.post("{}" + " ".repeat(1024 * 1024)).status, 413);
  assert.equal(server.reads.length, 0);
});

test("the shipped installer prefetches an entry and 1000 transitive siblings", async () => {
  const { makeInstaller } = require("../modules-runtime/.npm/package/node_modules/install");
  const install = makeInstaller();
  const server = backend();
  const requests = [];
  let appModule;
  const folder = { "index.js": Array.from({ length: 1000 }, (_, i) => "./module-" + i + ".js") };
  for (let i = 0; i < 1000; i++) folder["module-" + i + ".js"] = [];
  const rootRequire = install({
    "main.js": (require, exports, module) => { appModule = module; },
    imports: folder,
  });
  rootRequire("/main.js");
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "client.js"), "utf8"), {
    module: { constructor: install.Module }, exports: {}, global: {},
    Meteor: { settings: {}, absoluteUrl: url => url },
    require(name) {
      if (name === "meteor/modules") return { meteorInstall: install };
      if (name === "./cache.js") return { checkMany: () => Promise.resolve({}), setMany() {} };
      if (name === "./dynamic-versions.js") return { get: () => null };
      return require(path.join(__dirname, name));
    },
    fetch(url, options) {
      const response = server.post(options.body);
      requests.push(response.status);
      return Promise.resolve({ ok: response.status === 200, status: response.status,
        json: async () => JSON.parse(response.body) });
    },
  });
  await appModule.prefetch("./imports/index.js");
  assert.deepEqual(requests, [200, 200]);
  assert.equal(server.reads.length, 1001);
  assert.doesNotThrow(() => rootRequire("/imports/module-999.js"));
});

function missingFolders(folders, perFolder) {
  const tree = {};
  for (let folder = 0; folder < folders; folder++) {
    tree["folder-" + folder] = Object.fromEntries(Array.from({ length: perFolder }, (_, i) => ["missing-" + i + ".js", 1]));
  }
  return tree;
}

test("unreadable modules cost a bounded number of reads and one log line per request", () => {
  const server = backend({ exists: () => false });
  const res = server.post(JSON.stringify(missingFolders(10, 998)));
  assert.equal(res.status, 200);
  assert.equal(res.body, "null");
  assert.equal(server.reads.length, 100);
  assert.equal(server.logs.length, 1);
  assert.match(server.logs[0], /failed to read 100 requested module\(s\) and skipped 9880 more/);
  assert.match(server.logs[0], /ENOENT/);
});

test("readable and cached modules are still served next to unreadable ones", () => {
  const server = backend({ exists: filename => !filename.includes("missing") });
  const small = server.post(JSON.stringify({ imports: { "real.js": 1, "missing.js": 1 } }));
  assert.equal(small.status, 200);
  assert.deepEqual(Object.keys(JSON.parse(small.body).imports), ["real.js"]);
  assert.equal(server.reads.length, 2);
  assert.deepEqual(server.logs.length, 1);
  assert.match(server.logs[0], /failed to read 1 requested module\(s\); first error/);

  // Once the failure budget is spent, the cached module is still returned.
  const tree = missingFolders(2, 150);
  tree.imports = { "real.js": 1 };
  const large = server.post(JSON.stringify(tree));
  assert.equal(large.status, 200);
  assert.deepEqual(JSON.parse(large.body), { imports: { "real.js": "function (require, exports, module) {}" } });
  assert.equal(server.reads.length, 2 + 100);
  assert.equal(server.logs.length, 2);
  assert.match(server.logs[1], /failed to read 100 requested module\(s\) and skipped 200 more/);
});
