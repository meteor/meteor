import { discoverRspackFileExtensions } from "./lib/file-extensions";
import { getBundleLinkContent } from "./lib/module-imports";

Tinytest.add("rspack - file extensions - discovers application extensions", (test) => {
  let globCall;
  const globSync = (pattern, options) => {
    globCall = { pattern, options };
    return ["client/main.CSS", "imports/schema.graphql", "imports/icon.SVG", "README", ".env"];
  };

  const extensions = discoverRspackFileExtensions({
    globSync,
    cwd: "/app",
    generatedContexts: ["_build", "build-assets", "build-chunks", ".rsdoctor"],
  });

  [".js", ".mts", ".cts", ".wasm", ".css", ".graphql", ".svg"].forEach((extension) => {
    test.isTrue(extensions.includes(extension), `Expected ${extension} to be delegated to Rspack`);
  });
  test.isFalse(extensions.includes(""));
  test.equal(globCall, {
    pattern: "**/*",
    options: {
      cwd: "/app",
      nodir: true,
      dot: true,
      ignore: [
        "node_modules/**",
        ".meteor/**",
        ".git/**",
        "public/**",
        "private/**",
        "_build/**",
        "build-assets/**",
        "build-chunks/**",
        ".rsdoctor/**",
      ],
    },
  });
});

Tinytest.add("rspack - file extensions - preserves Meteor compiler inputs", (test) => {
  const extensions = discoverRspackFileExtensions({
    globSync: () => [
      "client/main.html",
      "client/main.less",
      "client/main.scss",
      "client/theme.sass",
      "imports/main.js",
    ],
    cwd: "/app",
    generatedContexts: ["_build", "_build"],
    compilerExtensions: [".HTML", ".less", ".scss", ".sass"],
  });

  [".html", ".less", ".scss", ".sass"].forEach((extension) => {
    test.isFalse(
      extensions.includes(extension),
      `Expected Meteor to retain ownership of ${extension}`,
    );
  });
  test.isTrue(extensions.includes(".js"));
});

Tinytest.add("rspack - file extensions - normalizes generated contexts", (test) => {
  let globOptions;

  discoverRspackFileExtensions({
    globSync: (pattern, options) => {
      globOptions = options;
      return [];
    },
    cwd: "/app",
    generatedContexts: ["./_build/", "_build", "custom\\chunks\\"],
  });

  test.isTrue(globOptions.ignore.includes("_build/**"));
  test.isTrue(globOptions.ignore.includes("custom/chunks/**"));
  test.equal(globOptions.ignore.length, 7);
});

// #14561: the client bundle must be served + injected, not imported; the server
// bundle must still be imported; native clients still import.
const IMPORT_RE = /import\s+['"]\.\/[^'"]*client-rspack\.js['"]/;
const SERVED_RE = /served as a static resource and injected as a <script>/;

Tinytest.add("rspack - client bundle is served + injected, not imported", (test) => {
  const content = getBundleLinkContent({ isClient: true, outputFile: "client-rspack.js" }, "client");
  test.isFalse(IMPORT_RE.test(content), `expected no client-rspack.js import, got: ${content}`);
  test.isTrue(SERVED_RE.test(content), `expected serve + inject marker, got: ${content}`);
});

Tinytest.add("rspack - server bundle is still imported", (test) => {
  const content = getBundleLinkContent({ isServer: true, outputFile: "server-rspack.js" }, "server");
  test.isTrue(
    /import\s+['"]\.\/server-rspack\.js['"]/.test(content),
    `expected server bundle import, got: ${content}`,
  );
});

Tinytest.add("rspack - native client still imports the bundle", (test) => {
  const content = getBundleLinkContent(
    { isClient: true, isNative: true, outputFile: "client-rspack.js" },
    "client",
  );
  test.isTrue(IMPORT_RE.test(content), `expected native client to import the bundle, got: ${content}`);
});
