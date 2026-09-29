const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const devBundleModules = path.join(__dirname, "../dev_bundle/lib/node_modules");
const acorn = require(path.join(devBundleModules, "acorn"));

const statsSource = fs
  .readFileSync(path.join(__dirname, "../packages/standard-minifier-js/plugin/stats.js"), "utf8")
  .replace(/^import .*;\n/gm, "")
  .replace("export function extractModuleSizesTree", "function extractModuleSizesTree");

function extract(source) {
  const context = {
    Buffer,
    acorn,
  };

  vm.runInNewContext(`${statsSource}\nthis.extract = extractModuleSizesTree;`, context);
  return context.extract(source);
}

test("extracts nested module byte sizes from multiple calls", () => {
  const first = 'meteorInstall({app:{"first.js":function(){return "é"}}});';
  const second = 'meteorInstall({app:{"second.js":()=>42}});';
  const tree = extract(`${first}${second}`);

  expect(JSON.parse(JSON.stringify(tree))).toEqual({
    app: {
      "first.js": Buffer.byteLength('function(){return "é"}'),
      "second.js": Buffer.byteLength("()=>42"),
    },
  });
});

test("extracts stats without materializing a full-file syntax tree", () => {
  const moduleBody = `function(){${"var value=1;".repeat(10000)}}`;
  const source = `meteorInstall({app:{"large.js":${moduleBody}}});`;
  const parse = jest.spyOn(acorn, "parse").mockImplementation(() => {
    throw new Error("full-file parsing is forbidden");
  });

  try {
    const tree = extract(source);
    expect(tree.app["large.js"]).toBe(Buffer.byteLength(moduleBody));
    expect(parse).not.toHaveBeenCalled();
  } finally {
    parse.mockRestore();
  }
});

test.each([
  [
    'var a=Package.modules.meteorInstall;a({"app":{"a.js":function(){return /[,{}]/.test(`{${1}}`)}}});',
    'function(){return /[,{}]/.test(`{${1}}`)}',
  ],
  [
    '(0,Package.modules.meteorInstall)({app:{default:()=>"😀"}});',
    '()=>"😀"',
  ],
])("handles minified and indirect meteorInstall calls", (source, moduleBody) => {
  const tree = extract(source);
  const app = tree.app;
  const size = Buffer.byteLength(moduleBody);

  expect(Object.values(app)).toEqual([size]);
});

test("counts UTF-8 across chunk boundaries", () => {
  const moduleBody = `function(){return "${"a".repeat(256 * 1024 - 20)}😀"}`;
  const source = `meteorInstall({app:{"unicode.js":${moduleBody}}});`;

  expect(extract(source).app["unicode.js"]).toBe(Buffer.byteLength(moduleBody));
});
