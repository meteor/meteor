"use strict";

const fs = require("fs");
const path = require("path");

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

describe("Meteor 3.6 template type-provider compatibility", () => {
  test.each(typedTemplates)(
    "%s preserves zodern precedence while allowing native opt-in",
    (template) => {
      const config = fs.readFileSync(assetPath(template, "tsconfig.json"), "utf8");
      const nativePackages = config.indexOf(".meteor/types/packages/*");
      const externalTypes = config.indexOf("node_modules/@types/meteor/*");
      const zodernTypes = config.indexOf(".meteor/local/types/packages.d.ts");
      const nativeBarrel = config.lastIndexOf(".meteor/types/packages.d.ts");

      expect(nativePackages).toBeGreaterThanOrEqual(0);
      expect(externalTypes).toBeGreaterThan(nativePackages);
      expect(externalTypes).toBeGreaterThanOrEqual(0);
      expect(zodernTypes).toBeGreaterThan(externalTypes);
      expect(nativeBarrel).toBeGreaterThan(zodernTypes);
    }
  );

  test.each(typedTemplates)("%s installs zodern:types directly", (template) => {
    const packages = fs.readFileSync(
      assetPath(template, path.join(".meteor", "packages")),
      "utf8"
    );
    expect(packages).toMatch(/^zodern:types(?:\s|$)/m);
  });

  test.each(javascriptTemplates)(
    "%s does not opt a JavaScript app into generated declarations",
    (template) => {
      expect(fs.existsSync(assetPath(template, "jsconfig.json"))).toBe(false);
    }
  );
});
