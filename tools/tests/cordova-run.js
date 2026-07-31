import selftest from '../tool-testing/selftest.js';
import utils from '../utils/utils.js';
import {
  parseServerOptionsForRunCommand,
  setRunCommandMobileServerUrl,
} from '../cli/commands.js';

function expectedDetectedMobileServerUrl(port) {
  let hostname;
  try {
    hostname = utils.ipAddress();
  } catch (_) {
    hostname = 'localhost';
  }
  return { hostname, port, protocol: "http" };
}

selftest.define('get mobile server argument for meteor run', ['cordova'], async function () {
  // meteor run -p 3000
  // => mobile server should be <detected ip>:3000
  await selftest.expectEqual(parseServerOptionsForRunCommand({
    port: "3000"
  }).parsedMobileServerUrl, expectedDetectedMobileServerUrl("3000"));

  // meteor run -p example.com:3000
  // => mobile server should be <detected ip>:3000
  await selftest.expectEqual(parseServerOptionsForRunCommand({
    port: "example.com:3000"
  }).parsedMobileServerUrl, expectedDetectedMobileServerUrl("3000"));

  // meteor run -p 192.168.1.10:3000
  // => mobile server should honor the explicitly bound non-loopback IP
  await selftest.expectEqual(parseServerOptionsForRunCommand({
    port: "192.168.1.10:3000"
  }).parsedMobileServerUrl, { hostname: "192.168.1.10", port: "3000", protocol: "http" });

  // meteor run -p example.com:3000 --mobile-server 4000 => error, mobile
  // server must include a hostname
  await selftest.expectThrows(() => {
    parseServerOptionsForRunCommand({
      port: "example.com:3000",
      "mobile-server": "4000"
    });
  });

  // meteor run -p example.com:3000 --mobile-server example.com =>
  // mobile server should be example.com
  await selftest.expectEqual(parseServerOptionsForRunCommand({
    port: "example.com:3000",
    "mobile-server": "example.com"
  }).parsedMobileServerUrl, { protocol: "http", hostname: "example.com", port: undefined });

  // meteor run -p example.com:3000 --mobile-server https://example.com =>
  // mobile server should be https://example.com
  await selftest.expectEqual(parseServerOptionsForRunCommand({
    port: "example.com:3000",
    "mobile-server": "https://example.com"
  }).parsedMobileServerUrl, { hostname: "example.com", protocol: "https", port: undefined });

  // meteor run -p example.com:3000 --mobile-server http://example.com:4000 =>
  // mobile server should be http://example.com:4000
  await selftest.expectEqual(parseServerOptionsForRunCommand({
    port: "example.com:3000",
    "mobile-server": "http://example.com:4000"
  }).parsedMobileServerUrl, { hostname: "example.com", port: "4000", protocol: "http" });

  // meteor run -p example.com:3000 --cordova-server-port 12500 =>
  // cordovaServerPort should be 12500
  await selftest.expectEqual(parseServerOptionsForRunCommand({
    port: "example.com:3000",
    "cordova-server-port": "12500"
  }).parsedCordovaServerPort, 12500);

  const previousCommand = global.currentCommand;
  try {
    global.currentCommand = { name: 'run', options: {} };
    const mobileServerUrl = setRunCommandMobileServerUrl({
      protocol: 'http',
      hostname: 'localhost',
      port: '3000',
    });

    await selftest.expectEqual(mobileServerUrl, 'http://localhost:3000/');
    await selftest.expectEqual(
      global.currentCommand.mobileServerUrl,
      'http://localhost:3000/',
    );
  } finally {
    global.currentCommand = previousCommand;
  }
});
