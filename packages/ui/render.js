var Component = UIComponent;


makeRenderBuffer = function (component, options) {
  var isPreview = !! options && options.preview;

  var strs = [];
  var componentsToAttach = {};
  var randomString = Random.id();
  var commentUid = 1;

  var handle = function (arg) {
    if (typeof arg === 'string') {
      strs.push(arg);
    } else if (arg instanceof Component) {
      var commentString = randomString + '_' + (commentUid++);
      strs.push('<!--', commentString, '-->');
      component.add(arg);
      componentsToAttach[commentString] = arg;
    } else if (arg.type) {
      // `{type: componentTypeOrFunction, args: object}`
      if (Component.isType(arg.type)) {
        handle(arg.type.create(arg.args));
      } else if (typeof arg.type === 'function') {
        var curType;
        component.autorun(function (c) {
          // capture reactivity:
          var type = arg.type();
          if (c.firstRun) {
            curType = type;
          } else if (component.stage !== Component.BUILT ||
                     ! component.hasChild(curChild)) {
            c.stop();
          } else if (type !== curType) {
            var oldChild = curChild;
            curType = type;
            Deps.nonreactive(function () {
              curChild = curType.create(arg.args);
              component.replaceChild(oldChild, curChild);
            });
          }
        });
        var curChild = curType.create(arg.args);
        handle(curChild);
      } else {
        throw new Error("Expected 'type' to be Component or function");
      }
    } else {
      throw new Error("Expected string or Component");
    }
  };

  var buf = function (/*args*/) {
    for (var i = 0; i < arguments.length; i++)
      handle(arguments[i]);
  };

  buf.getHtml = function () {
    return strs.join('');
  };

  buf.componentsToAttach = componentsToAttach;

  return buf;
};
