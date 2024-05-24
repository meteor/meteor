import selftest from '../tool-testing/selftest.js';
import utils from '../utils/utils.js';
import { parseServerOptionsForRunCommand } from '../cli/commands.js';

selftest.define('get mobile server argument for meteor run', ['cordova'], function () {
  // meteor run -p 3000
  // => mobile server should be <detected ip>:3000
  selftest.expectEqual(parseServerOptionsForRunCommand({
    port: "3000"
  }).parsedMobileServerUrl, { hostname: utils.ipAddress(), port: "3000", protocol: "http" });

  // meteor run -p example.com:3000
  // => mobile server should be <detected ip>:3000
  selftest.expectEqual(parseServerOptionsForRunCommand({
    port: "example.com:3000"
  }).parsedMobileServerUrl, { hostname: utils.ipAddress(), port: "3000", protocol: "http" });

  // meteor run -p example.com:3000 --mobile-server 4000 => error, mobile
  // server must include a hostname
  selftest.expectThrows(() => {
    parseServerOptionsForRunCommand({
      port: "example.com:3000",
      "mobile-server": "4000"
    });
  });

  // meteor run -p example.com:3000 --mobile-server example.com =>
  // mobile server should be example.com
  selftest.expectEqual(parseServerOptionsForRunCommand({
    port: "example.com:3000",
    "mobile-server": "example.com"
  }).parsedMobileServerUrl, { protocol: "http", hostname: "example.com", port: undefined });

  // meteor run -p example.com:3000 --mobile-server https://example.com =>
  // mobile server should be https://example.com
  selftest.expectEqual(parseServerOptionsForRunCommand({
    port: "example.com:3000",
    "mobile-server": "https://example.com"
  }).parsedMobileServerUrl, { hostname: "example.com", protocol: "https", port: undefined });

  // meteor run -p example.com:3000 --mobile-server http://example.com:4000 =>
  // mobile server should be http://example.com:4000
  selftest.expectEqual(parseServerOptionsForRunCommand({
    port: "example.com:3000",
    "mobile-server": "http://example.com:4000"
  }).parsedMobileServerUrl, { hostname: "example.com", port: "4000", protocol: "http" });

  // meteor run -p example.com:3000 --cordova-server-port 12500 =>
  // cordovaServerPort should be 12500
  selftest.expectEqual(parseServerOptionsForRunCommand({
    port: "example.com:3000",
    "cordova-server-port": "12500"
  }).parsedCordovaServerPort, 12500);
});
