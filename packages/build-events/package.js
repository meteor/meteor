Package.describe({
  version: "1.0.0",
  debugOnly: true
});

Package.onUse((api) => {
  api.addFiles("event-handler.js", "client");
});
