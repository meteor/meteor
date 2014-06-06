Template.__dynamicWithDataContext.chooseTemplate = function (name) {
  return Template[name] || null;
};

Template.__dynamic.dataContextPresent = function () {
  return _.has(this, "data");
};

Template.__dynamic.checkContext = function () {
  if (! _.has(this, "template")) {
    throw new Error("Must specify name in the 'template' argument " +
                    "to {{> UI.dynamic}}.");
  }

  _.each(this, function (v, k) {
    if (k !== "template" && k !== "data") {
      throw new Error("Invalid argument to {{> UI.dynamic}}: " +
                      k);
    }
  });
};
