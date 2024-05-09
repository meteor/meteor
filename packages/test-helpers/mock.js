mockBehaviours = function _mockBehaviours(obj, mockBehaviors = {}) {
  const originalFunctions = {};
  const disabledRuns = [];

  // Store original functions
  for (const key in obj) {
    if (typeof obj[key] === 'function') {
      originalFunctions[key] = obj[key];
    }
  }

  // Mutate functions to identity functions
  for (const key in obj) {
    if (typeof obj[key] === 'function') {
      obj[key] = function(...params) {
        disabledRuns.push({ name: key, params });
        if (typeof mockBehaviors?.[key] === 'function') {
          return mockBehaviors[key](...params);
        }
        return params?.[0];
      };
    }
  }

  // Method to revert the mutation
  const stop = function() {
    for (const key in originalFunctions) {
      obj[key] = originalFunctions[key];
    }
  };

  return { stop, disabledRuns };
};
