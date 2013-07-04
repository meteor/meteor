var Component = UIComponent;

Component.define({
  INITIAL: '<INITIAL>',
  ADDED: '<ADDED>',
  BUILT: '<BUILT>',
  DESTROYED: '<DESTROYED>'
});

Component({
  stage: Component.INITIAL,

  // use this internally, not to produce error messages for
  // developers
  _assertStage: function (stage) {
    if (this.stage !== stage)
      throw new Error("Need " + stage + " Component, found " +
                      this.stage + " Component.");
  },

  // use this to produce error messages
  _requireNotDestroyed: function () {
    if (this.stage === Component.DESTROYED)
      throw new Error("Component has been destroyed; can't perform this operation");
  },

  _added: function () {
    this._assertStage(Component.INITIAL);
    this.stage = Component.ADDED;
    this.init();
  },

  _built: function () {
    this._assertStage(Component.ADDED);
    this.stage = Component.BUILT;
    this.built();
  },

  destroy: function () {
    if (this.stage === Component.DESTROYED)
      return;

    this.stage = Component.DESTROYED;

    this.destroyed();
  },

  init: function () {},
  built: function () {},
  destroyed: function () {},

  extendHooks: {
    init: 'chain',
    built: 'chain',
    destroyed: 'chain'
  }
});
