UI.body2 = new Blaze.Component();
_.extend(UI.body2, {
  contentParts: [],
  render: function () {
    return _.map(this.contentParts, function (f) { return f(); });
  }
});
