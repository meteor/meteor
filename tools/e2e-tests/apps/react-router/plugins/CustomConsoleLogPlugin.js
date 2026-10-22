// CustomConsoleLogPlugin.js
class CustomConsoleLogPlugin {
  apply(compiler) {
    compiler.hooks.beforeRun.tap('CustomConsoleLogPlugin', (compilation) => {
      console.log('👉 [CustomConsoleLogPlugin] Build is starting...');
    });

    compiler.hooks.done.tap('CustomConsoleLogPlugin', (stats) => {
      console.log('✅ [CustomConsoleLogPlugin] Build finished successfully!');
    });
  }
}

module.exports = CustomConsoleLogPlugin;
