Package.describe({
  name: 'debug-only-prod-only',
  debugOnly: true
});

// Test setting debugOnly and prodOnly in two different Package.describe calls,
// because if this is caught, then setting them in the same Package.describe
// call will definitely be caught!
Package.describe({
  name: 'debug-only-prod-only',
  prodOnly: true
});

Package.onUse(function(api) {
  // nothing
});
