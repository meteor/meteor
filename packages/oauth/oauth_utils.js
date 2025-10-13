// NOTE: This file is added to the client as asset and hence ecmascript package has no effect here.
// Shared utility functions for OAuth client-side operations

window.OAuthUtils = {
  storeOAuthError: function(storage, config) {
    if (config.error) {
      storage[config.storagePrefix + "error"] = config.error;
      if (config.error_description) {
        storage[config.storagePrefix + "error_description"] = config.error_description;
      }
    }
  }
};