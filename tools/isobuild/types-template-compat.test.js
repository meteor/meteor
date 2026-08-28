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
    "%s keeps @types/meteor before the zodern type barrel",
    (template) => {
      const config = fs.readFileSync(assetPath(template, "tsconfig.json"), "utf8");
      const externalTypes = config.indexOf("node_modules/@types/meteor/*");
      const zodernTypes = config.indexOf(".meteor/local/types/packages.d.ts");

      expect(externalTypes).toBeGreaterThanOrEqual(0);
      expect(zodernTypes).toBeGreaterThan(externalTypes);
      expect(config).not.toContain(".meteor/types/packages.d.ts");
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
