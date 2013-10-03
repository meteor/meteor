Handlebars = {
  _globalHelpers: {},

  registerHelper: function (name, func) {
    this._globalHelpers[name] = func;
  }
};
