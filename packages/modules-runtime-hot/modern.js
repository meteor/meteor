meteorInstall = makeInstaller({
  // On the client, make package resolution prefer the "browser" field of
  // package.json over the "module" field over the "main" field.
  browser: true,
  mainFields: ["browser", "module", "main"],

  fallback: function (id, parentId, error) {
    if (id && id.startsWith('meteor/')) {
      var packageName = id.split('/', 2)[1];
      throw new Error(
        'Cannot find package "' + packageName + '". ' +
        'Try "meteor add ' + packageName + '".'
      );
    }

    throw error;
  }
});

let Module = Package['modules-runtime'].meteorInstall.Module;
meteorInstall.Module.prototype.link = Module.prototype.link;

Object.defineProperty(meteorInstall.Module.prototype, "hot", {
  get: function () {
    if (!this._hotState) {
      this._hotState = {
        // if null, whether it accepts depends on all of the modules that
        // required it
        _hotAccepts: null,
        _disposeHandlers: [],
        data: null
      };
    }

    let hotState = this._hotState;

    return {
      accept() {
        if (arguments.length > 0) {
          // TODO: support same options as webpack
          console.warn('hot.accept does not support any arguments.');
        }
        hotState._hotAccepts = true;
      },
      decline() {
        if (arguments.length > 0) {
          throw new Error('hot.decline does not support any arguments.');
        }

        hotState._hotAccepts = false;
      },
      dispose(cb) {
        hotState._disposeHandlers.push(cb);
      },
      _canAcceptUpdate() {
        return hotState._hotAccepts;
      },
      data: hotState.data
    }
  },
  set() {}
});

// Due to changes in the comet meteor-tool, this package should be running
// after modules-runtime but before modules. We want modules to use
// our patched meteorInstall
Package['modules-runtime'].meteorInstall = meteorInstall;
