"use strict";

const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const repoRoot = path.resolve(__dirname, "../..");

const typedTemplates = [
  "skel-typescript",
  "skel-typescript-tailwind",
  "skel-svelte",
  "skel-angular",
];

const javascriptTemplates = [
  "skel-blaze",
  "skel-chakra-ui",
  "skel-full",
  "skel-minimal",
  "skel-react",
  "skel-solid",
  "skel-tailwind",
];

function assetPath(template, file) {
  return path.join(repoRoot, "tools", "static-assets", template, file);
}

describe("Meteor template type providers", () => {
  test.each(typedTemplates)(
    "%s selects native declarations, including scoped modules",
    (template) => {
      const { config, error } = ts.readConfigFile(
        assetPath(template, "tsconfig.json"),
        ts.sys.readFile
      );
      expect(error).toBeUndefined();
      expect(config.compilerOptions.paths["meteor/*"]).toEqual([
        "./.meteor/types/packages/*",
      ]);
      expect(config.files).toContain("./.meteor/types/packages.d.ts");
      expect(config.compilerOptions.types || []).not.toContain("meteor");

      if (template === "skel-angular") {
        const { config: appConfig } = ts.readConfigFile(
          assetPath(template, "tsconfig.app.json"),
          ts.sys.readFile
        );
        expect(appConfig.compilerOptions.types).not.toContain("meteor");
      }
    }
  );

  test.each(typedTemplates)("%s does not install legacy type providers", (template) => {
    const packages = fs.readFileSync(
      assetPath(template, path.join(".meteor", "packages")),
      "utf8"
    );
    expect(packages).not.toMatch(/^zodern:types(?:@|\s|$)/m);
    const packageJson = JSON.parse(
      fs.readFileSync(assetPath(template, "package.json"), "utf8")
    );
    expect(packageJson.dependencies || {}).not.toHaveProperty("@types/meteor");
    expect(packageJson.devDependencies || {}).not.toHaveProperty("@types/meteor");
  });

  test.each(javascriptTemplates)(
    "%s does not opt a JavaScript app into generated declarations",
    (template) => {
      expect(fs.existsSync(assetPath(template, "jsconfig.json"))).toBe(false);
    }
  );
});
