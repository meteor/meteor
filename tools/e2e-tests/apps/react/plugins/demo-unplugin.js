const { createUnplugin } = require('unplugin');

const demoUnplugin = createUnplugin(() => {
  console.log('[demo-unplugin][factory-created]');
  return {
    name: 'demo-unplugin',
    transformInclude(id) {
      // Only process app source files, skip node_modules and .meteor
      if (id.includes('node_modules') || id.includes('.meteor')) {
        return false;
      }
      const ok =
        id.endsWith('.tsx') ||
        id.endsWith('.ts') ||
        id.endsWith('.jsx') ||
        id.endsWith('.js');

      if (ok) {
        console.log('[demo-unplugin][transformInclude]', id, '=> true');
      }
      return ok;
    },
    transform(code, id) {
      console.log('[demo-unplugin][transform-enter]', id);
      return { code, map: null };
    },
  };
});

module.exports = { demoRspackPlugin: demoUnplugin.rspack };
