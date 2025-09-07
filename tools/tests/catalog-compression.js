var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;
var files = require('../fs/files');

// Test that catalog compression works without breaking functionality
selftest.define("catalog compression", ['checkout'], async function () {
  var s = new Sandbox();
  await s.init();

  // Test 1: Compression enabled (default)
  var run = s.run("create", "compression-test-app");
  run.waitSecs(60);
  await run.expectExit(0);
  
  s.cd("compression-test-app");
  
  // Verify app was created successfully with compressed catalog
  await selftest.expectEqual(s.exists(".meteor/packages"), true);
  await selftest.expectEqual(s.exists(".meteor/release"), true);
  
  // Test 2: Add a package to ensure catalog queries work
  run = s.run("add", "reactive-var");
  run.waitSecs(30);
  await run.expectExit(0);
  
  // Verify package was added successfully
  var packages = s.read(".meteor/packages");
  await selftest.expectEqual(packages.includes("reactive-var"), true);
  
  // Test 3: Test with compression disabled
  s.set('METEOR_DISABLE_CATALOG_COMPRESSION', '1');
  
  run = s.run("add", "tracker");
  run.waitSecs(30);
  await run.expectExit(0);
  
  // Verify package addition still works with compression disabled
  packages = s.read(".meteor/packages");
  await selftest.expectEqual(packages.includes("tracker"), true);
  
  // Test 4: Verify no corruption during compression/decompression cycles
  run = s.run("remove", "reactive-var");
  run.waitSecs(30);
  await run.expectExit(0);
  
  run = s.run("add", "reactive-var");
  run.waitSecs(30);
  await run.expectExit(0);
  
  // Should still work after multiple add/remove cycles
  packages = s.read(".meteor/packages");
  await selftest.expectEqual(packages.includes("reactive-var"), true);
});

// Test that compressed and uncompressed catalogs produce identical results
selftest.define("catalog compression compatibility", ['checkout'], async function () {
  var s1 = new Sandbox();
  var s2 = new Sandbox();
  await s1.init();
  await s2.init();

  // Create identical apps with different compression settings
  s1.set('METEOR_DISABLE_CATALOG_COMPRESSION', '1'); // Uncompressed
  s2.unset('METEOR_DISABLE_CATALOG_COMPRESSION');     // Compressed (default)
  
  var run1 = s1.run("create", "uncompressed-app");
  var run2 = s2.run("create", "compressed-app");
  
  run1.waitSecs(60);
  run2.waitSecs(60);
  
  await run1.expectExit(0);
  await run2.expectExit(0);
  
  s1.cd("uncompressed-app");
  s2.cd("compressed-app");
  
  // Add the same packages to both apps
  var testPackages = ["reactive-var", "tracker", "mongo"];
  
  for (const pkg of testPackages) {
    run1 = s1.run("add", pkg);
    run2 = s2.run("add", pkg);
    
    run1.waitSecs(30);
    run2.waitSecs(30);
    
    await run1.expectExit(0);
    await run2.expectExit(0);
  }
  
  // Both should produce identical .meteor/versions files
  var versions1 = s1.read(".meteor/versions");
  var versions2 = s2.read(".meteor/versions");
  
  await selftest.expectEqual(versions1, versions2);
  
  // Both should produce identical .meteor/packages files  
  var packages1 = s1.read(".meteor/packages");
  var packages2 = s2.read(".meteor/packages");
  
  await selftest.expectEqual(packages1, packages2);
});

// Performance test to ensure compression doesn't significantly slow things down
selftest.define("catalog compression performance", ['checkout'], async function () {
  var s = new Sandbox();
  await s.init();

  // Test with compression
  var startTime = Date.now();
  var run = s.run("create", "perf-test-compressed");
  run.waitSecs(120);
  await run.expectExit(0);
  var compressedTime = Date.now() - startTime;
  
  s.cd("perf-test-compressed");
  
  startTime = Date.now();
  run = s.run("add", "reactive-var", "tracker", "mongo");
  run.waitSecs(60);
  await run.expectExit(0);
  var compressedAddTime = Date.now() - startTime;
  
  // Test with compression disabled
  s.set('METEOR_DISABLE_CATALOG_COMPRESSION', '1');
  
  startTime = Date.now();
  run = s.run("create", "perf-test-uncompressed");
  run.waitSecs(120);
  await run.expectExit(0);
  var uncompressedTime = Date.now() - startTime;
  
  s.cd("perf-test-uncompressed");
  
  startTime = Date.now();
  run = s.run("add", "reactive-var", "tracker", "mongo");
  run.waitSecs(60);
  await run.expectExit(0);
  var uncompressedAddTime = Date.now() - startTime;
  
  // Compression shouldn't make things significantly slower
  // Allow up to 50% overhead for compression/decompression
  if (compressedTime > uncompressedTime * 1.5) {
    await selftest.fail(`Compression too slow: compressed=${compressedTime}ms, uncompressed=${uncompressedTime}ms`);
  }
  
  if (compressedAddTime > uncompressedAddTime * 1.5) {
    await selftest.fail(`Compressed package add too slow: compressed=${compressedAddTime}ms, uncompressed=${uncompressedAddTime}ms`);
  }
});
