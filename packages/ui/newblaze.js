UI.body2 = new Blaze.Component();

_.extend(UI.body2, {
  // content parts are render methods (expect `UI.body2` in `this`)
  contentParts: [],
  render: function () {
    var self = this;
    return _.map(this.contentParts, function (f) {
      return f.call(self);
    });
  }
});
