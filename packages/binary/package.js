Package.describe({
    summary: "Binary data serialization and deserialization",
    version: '1.0.0',
  });
  
  Package.onUse(api => {
    api.export('binary');
    api.use('ecmascript');
    api.mainModule('binary.js');
  });
  