var Component = UIComponent;

Component.define({
  INITIAL: '<INITIAL>',
  ADDED: '<ADDED>',
  BUILT: '<BUILT>',
  DESTROYED: '<DESTROYED>'
});

Component({
  stage: Component.INITIAL,

  _assertStage: function (stage) {
    if (this.stage !== stage)
      throw new Error("Need " + stage + " Component, found " +
                      this.stage + " Component.");
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

  extendHooks: {
    init: 'chain',
    built: 'chain',
    destroyed: 'chain'
  }
});
