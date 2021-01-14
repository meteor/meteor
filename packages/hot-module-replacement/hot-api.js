const meteorInstall = Package['modules-runtime'].meteorInstall;

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
    let module = this;

    return {
      accept() {
        if (arguments.length > 0) {
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
      onRequire(callbacks) {
        return module._onRequire(callbacks);
      },
      _canAcceptUpdate() {
        return hotState._hotAccepts;
      },
      data: hotState.data
    }
  },
  set() { }
});
