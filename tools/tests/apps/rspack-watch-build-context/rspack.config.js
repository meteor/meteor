const path = require("node:path");

module.exports = {
  plugins: [
    {
      apply(compiler) {
        compiler.hooks.initialize.tap("AtomicServerBundleForWatchTest", () => {
          const outputFs = compiler.outputFileSystem;
          compiler.outputFileSystem = Object.assign(Object.create(outputFs), {
            writeFile(filename, contents, ...args) {
              if (path.basename(filename) !== "server-rspack.js") {
                return outputFs.writeFile(filename, contents, ...args);
              }

              // The test observes Meteor's build-context management continuously.
              // Rspack's ordinary writeFile truncates before writing, so publish
              // its bundle atomically to avoid sampling that unrelated interval.
              // Only Rspack's output filesystem is wrapped: Meteor's cleanup and
              // placeholder writes remain visible to every assertion.
              const callback = args.pop();
              const temporary = `${filename}.${process.pid}.tmp`;
              outputFs.writeFile(temporary, contents, ...args, (error) => {
                if (error) return callback(error);
                outputFs.rename(temporary, filename, callback);
              });
            },
          });
        });
      },
    },
  ],
};
