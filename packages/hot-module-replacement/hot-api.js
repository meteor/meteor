var meteorInstall = Package['modules-runtime'].meteorInstall;

/**
 * @summary The Hot API used to configure HMR
 * @memberof module
 * @name hot
 */
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

    var hotState = this._hotState;
    var module = this;

    return {
      /**
       * @summary Accept updates to this module. Also applies to its dependencies,
       * as long as the other modules that import the dependencies also accept
       * updates.
       * @locus Client
       * @memberOf module.hot
       * @instance
       * @name accept
       */
      accept: function () {
        if (arguments.length > 0) {
          console.warn('hot.accept does not support any arguments.');
        }

        if (hotState._hotAccepts === false) {
          return;
        }

        hotState._hotAccepts = true;
      },
      /**
        * @summary Disable updating this module or its dependencies with HMR.
        * Hot code push will be used instead. Can not be overridden by calling
        * module.hot.accept later.
        * @locus Client
        * @memberOf module.hot
        * @instance
        * @name decline
        */
      decline: function () {
        if (arguments.length > 0) {
          throw new Error('hot.decline does not support any arguments.');
        }

        hotState._hotAccepts = false;
      },
      /**
        * @summary Add a call back to clean up the module before replacing it
        * @locus Client
        * @memberOf module.hot
        * @instance
        * @name dispose
        * @param {module.hot.DisposeFunction} callback Called before replacing the old module.
        */
      dispose: function (cb) {
        hotState._disposeHandlers.push(cb);
      },
      /**
        * @summary Add callbacks to run before and after a module is required
        * @locus Client
        * @memberOf module.hot
        * @instance
        * @name onRequire
        * @param {Object} callbacks Can have before and after methods, called before a module is required,
        * and after it finished being evaluated
        */
      onRequire: function (callbacks) {
        return module._onRequire(callbacks);
      },
      _canAcceptUpdate: function () {
        return hotState._hotAccepts;
      },
      /**
       * @summary Defaults to null. When the module is replaced,
       * this is set to the object passed to dispose handlers.
       * @locus Client
       * @memberOf module.hot
       * @instance
       * @name data
       */
      data: hotState.data
    }
  },
  set: function () { }
});
