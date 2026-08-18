import assert from "node:assert/strict";
import test from "node:test";

import { checkThemeLinks } from "./check-theme-links.mjs";

test("rejects missing links in nested theme configuration", () => {
  assert.throws(
    () => checkThemeLinks({
      themeConfig: {
        sidebar: [{ text: "Underscore", link: "/packages/underscore" }],
      },
      pages: ["index.md", "packages/meteor.md"],
    }),
    /themeConfig\.sidebar\[0\]\.link: \/packages\/underscore does not match a documentation page/
  );
});

test("accepts supported internal route formats", () => {
  checkThemeLinks({
    themeConfig: {
      nav: [
        { text: "Home", link: "/" },
        { text: "API", link: "/api/" },
        { text: "Install", link: "/about/install.html#requirements" },
        { text: "Absolute", link: "https://docs.meteor.com/about/install" },
        { text: "External", link: "https://example.com/missing" },
        { text: "Protocol-relative", link: "//example.com/missing" },
      ],
    },
    pages: ["index.md", "api/index.md", "about/install.md"],
  });
});

test("reports invalid internal URLs", () => {
  assert.throws(
    () => checkThemeLinks({
      themeConfig: { nav: [{ text: "Invalid", link: "/%" }] },
      pages: ["index.md"],
    }),
    /\/% is not a valid URL/
  );
});

test("rejects encoded path separators", () => {
  assert.throws(
    () => checkThemeLinks({
      themeConfig: { nav: [{ text: "Ambiguous", link: "/about%2Finstall" }] },
      pages: ["about/install.md"],
    }),
    /\/about%2Finstall is not a valid URL/
  );
});
