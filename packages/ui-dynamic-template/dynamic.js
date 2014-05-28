Template.__dynamicWithDataContext.chooseTemplate = function (name) {
  return Template[name] || null;
};

Template.__dynamic.dataContextPresent = function () {
  return _.has(this, "data");
};
