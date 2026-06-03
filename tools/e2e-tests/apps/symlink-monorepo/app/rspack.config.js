const { defineConfig } = require('@meteorjs/rspack');

module.exports = defineConfig(() => {
  return {
    resolve: {
      // Relative imports inside symlinked files must resolve from the symlink path.
      symlinks: false,
    },
  };
});
