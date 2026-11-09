"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../..");

const legacyDeclarations = [
  ["accounts-base", "accounts-base.d.ts", "accounts-base.native.d.ts", "d298735fb1ea99a9098f23ff755078aeb7559d567dd70227f5ef66792621e30d"],
  ["browser-policy-common", "browser-policy-common.d.ts", "browser-policy-common.native.d.ts", "694e68b55462091075f16ecb0950999584d2844e497bb5013724b8e5413b907f"],
  ["check", "check.d.ts", "check.native.d.ts", "01bf59f389646f958bb4db856aa7163923a0aaa6b93674a2460dad937e17c2bd"],
  ["ddp-rate-limiter", "ddp-rate-limiter.d.ts", "ddp-rate-limiter.native.d.ts", "e773e811c37be8f470b2dc8502b8a3183434965146c31869b23687262f5e99a5"],
  ["ddp", "ddp.d.ts", "ddp.native.d.ts", "1c8c16847edbae379def0dbf397a87b13a79c030f33c343d3990a99f387076f6"],
  ["ejson", "ejson.d.ts", "ejson.native.d.ts", "fabe4ccda7bcc49aa64c86c45f66c0c48e97f36382f03795ee5bb8be8976d516"],
  ["email", "email.d.ts", "email.native.d.ts", "eba2c2bcec644f9b2976cdb622667b75e1ff78ba5b2218c007256ce940f9375e"],
  ["hot-module-replacement", "hot-module-replacement.d.ts", "hot-module-replacement.native.d.ts", "95d144fce0f668bb1aaff2b26689bd7f93d92706f43d2b81b1d6b76e18103bb9"],
  ["logging", "logging.d.ts", "logging.native.d.ts", "0aa0eed1e3f10f5df1839ab65cf4aa30e6f5288ab910fc30c1ddbf93d8d730b5"],
  ["meteor", "meteor.d.ts", "meteor.native.d.ts", "e822dfa50d73feb853ec0e6ac3d0eaba3a05e8882d74825a7504d436a1ceb764"],
  ["modern-browsers", "modern.d.ts", "modern.native.d.ts", "302388f149444ef9d1d486fc21c50d2d4f667fc7a6659cb62771119fd454a62f"],
  ["mongo", "mongo.d.ts", "mongo.native.d.ts", "c6db903ace001efb93efa5afd8c8a8a4ce10e310c3232b964c4f686658105d4b"],
  ["promise", "promise.d.ts", "promise.native.d.ts", "8f4ab059dc0eeafdbca8be614cf872e72aba4e57ede9a28699474df14df7827c"],
  ["random", "random.d.ts", "random.native.d.ts", "734c132b208d85399ff8a7fdd3e489102a4d5628d0b4d89f566d67479e1d90c8"],
  ["reactive-dict", "reactive-dict.d.ts", "reactive-dict.native.d.ts", "eb08cc7547b998ae4e884b57f7f00548766d1eeac46b0928f4c98d5e25678213"],
  ["roles", "definitions.d.ts", "definitions.native.d.ts", "694c83cf3e1cf66559e0114bb5e3a34400245fa2fb3482483c334e7b5b808a35"],
  ["server-render", "server-render.d.ts", "server-render.native.d.ts", "aa97a3e0e44179c57a4f943b73b6317683e687d6f48259f23ee21af3e8a159ef"],
  ["service-configuration", "service-configuration.d.ts", "service-configuration.native.d.ts", "3098024db1aed9b02bf66e0457d743ba6563a2d9862502aad7485c3a0533e814"],
  ["session", "session.d.ts", "session.native.d.ts", "e3aaf6b5c580064ad175981ac62c0ad3a006c1948e504a4d7269ec161aec9d56"],
  ["tracker", "tracker.d.ts", "tracker.native.d.ts", "f9258a5222fca65ae0f3de81742a399bf17ccc1db409c30efc113dd4bb1dd4a5"],
  ["webapp", "webapp.d.ts", "webapp.native.d.ts", "956920ca85e0766c0f4f00532759c101f0d7fe4391a8de147b1a8da51772534d"],
];

function normalizedHash(file) {
  const content = fs.readFileSync(file, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\n$/, "");
  return crypto.createHash("sha256").update(content).digest("hex");
}

describe("Meteor 3.6 legacy type-provider compatibility", () => {
  test.each(legacyDeclarations)(
    "%s preserves its legacy declaration and isolates its native declaration",
    (packageName, legacyFile, nativeFile, legacyHash) => {
      const packageDir = path.join(repoRoot, "packages", packageName);
      const packageJs = fs.readFileSync(path.join(packageDir, "package.js"), "utf8");

      expect(normalizedHash(path.join(packageDir, legacyFile))).toBe(legacyHash);
      expect(fs.existsSync(path.join(packageDir, nativeFile))).toBe(true);
      expect(packageJs).toMatch(
        new RegExp(`api\\.addAssets\\(['\"]${legacyFile.replaceAll(".", "\\.")}['\"],`)
      );
      expect(packageJs).toMatch(
        new RegExp(`api\\.types\\(['\"]${nativeFile.replaceAll(".", "\\.")}['\"]\\)`)
      );

      const metadataPath = path.join(packageDir, "package-types.json");
      if (fs.existsSync(metadataPath)) {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
        expect(metadata.typesEntry).toBe(legacyFile);
      }
    }
  );
});
