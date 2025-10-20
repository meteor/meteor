Package.describe({
  name: 'harry97:cbor',
  version: '1.2.1',
  summary: 'CBOR (Concise Binary Object Representation) with native File/Buffer/Blob support',
  git: '',
  documentation: 'README.md'
});

// Use cbor-x npm package for robust CBOR implementation
Npm.depends({
  'cbor-x': '1.5.5'
});

Package.onUse(function(api) {
  api.versionsFrom(['3.0.1']);
  
  // Core dependencies
  api.use(['ecmascript', 'base64']);
  
  // TypeScript definitions
  api.addAssets('cbor.d.ts', 'server');
  
  // Main files - unified implementation
  api.mainModule('cbor.js');
  
  // Export main interface
  api.export('CBOR');
  
  // Export internal utilities for testing
  api.export('CBOREncoder', {testOnly: true});
  api.export('CBORDecoder', {testOnly: true});
});

Package.onTest(function(api) {
  api.use(['ecmascript', 'tinytest', 'harry97:cbor',
     'ejson' // For comparison tests
    ]);
  api.addFiles('cbor_tests.js');
});
