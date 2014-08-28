Blaze._calculateCondition = function (cond) {
  if (cond instanceof Array && cond.length === 0)
    cond = false;
  return !! cond;
};

Blaze.With = function (data, contentFunc) {
  var view = Blaze.View('with', contentFunc);

  view.dataVar = new Blaze.ReactiveVar;

  view.onCreated(function () {
    if (typeof data === 'function') {
      // `data` is a reactive function
      view.autorun(function () {
        view.dataVar.set(data());
      }, view.parentView);
    } else {
      view.dataVar.set(data);
    }
  });

  return view;
};

Blaze.If = function (conditionFunc, contentFunc, elseFunc, _not) {
  var conditionVar = new Blaze.ReactiveVar;

  var view = Blaze.View(_not ? 'unless' : 'if', function () {
    return conditionVar.get() ? contentFunc() :
      (elseFunc ? elseFunc() : null);
  });
  view.__conditionVar = conditionVar;
  view.onCreated(function () {
    this.autorun(function () {
      var cond = Blaze._calculateCondition(conditionFunc());
      conditionVar.set(_not ? (! cond) : cond);
    }, this.parentView);
  });

  return view;
};

Blaze.Unless = function (conditionFunc, contentFunc, elseFunc) {
  return Blaze.If(conditionFunc, contentFunc, elseFunc, true /*_not*/);
};

Blaze.Each = function (argFunc, contentFunc, elseFunc) {
  var eachView = Blaze.View('each', function () {
    var subviews = this.initialSubviews;
    this.initialSubviews = null;
    if (this.isCreatedForExpansion) {
      this.expandedValueDep = new Tracker.Dependency;
      this.expandedValueDep.depend();
    }
    return subviews;
  });
  eachView.initialSubviews = [];
  eachView.numItems = 0;
  eachView.inElseMode = false;
  eachView.stopHandle = null;
  eachView.contentFunc = contentFunc;
  eachView.elseFunc = elseFunc;
  eachView.argVar = new Blaze.ReactiveVar;

  eachView.onCreated(function () {
    // We evaluate argFunc in an autorun to make sure
    // Blaze.currentView is always set when it runs (rather than
    // passing argFunc straight to ObserveSequence).
    eachView.autorun(function () {
      eachView.argVar.set(argFunc());
    }, eachView.parentView);

    eachView.stopHandle = ObserveSequence.observe(function () {
      return eachView.argVar.get();
    }, {
      addedAt: function (id, item, index) {
        Tracker.nonreactive(function () {
          var newItemView = Blaze.With(item, eachView.contentFunc);
          eachView.numItems++;

          if (eachView.expandedValueDep) {
            eachView.expandedValueDep.changed();
          } else if (eachView.domrange) {
            if (eachView.inElseMode) {
              eachView.domrange.removeMember(0);
              eachView.inElseMode = false;
            }

            var range = Blaze.materializeView(newItemView, eachView);
            eachView.domrange.addMember(range, index);
          } else {
            eachView.initialSubviews.splice(index, 0, newItemView);
          }
        });
      },
      removedAt: function (id, item, index) {
        Tracker.nonreactive(function () {
          eachView.numItems--;
          if (eachView.expandedValueDep) {
            eachView.expandedValueDep.changed();
          } else if (eachView.domrange) {
            eachView.domrange.removeMember(index);
            if (eachView.elseFunc && eachView.numItems === 0) {
              eachView.inElseMode = true;
              eachView.domrange.addMember(
                Blaze.materializeView(
                  Blaze.View('each_else',eachView.elseFunc),
                  eachView), 0);
            }
          } else {
            eachView.initialSubviews.splice(index, 1);
          }
        });
      },
      changedAt: function (id, newItem, oldItem, index) {
        Tracker.nonreactive(function () {
          var itemView;
          if (eachView.expandedValueDep) {
            eachView.expandedValueDep.changed();
          } else if (eachView.domrange) {
            itemView = eachView.domrange.getMember(index).view;
          } else {
            itemView = eachView.initialSubviews[index];
          }
          itemView.dataVar.set(newItem);
        });
      },
      movedTo: function (id, item, fromIndex, toIndex) {
        Tracker.nonreactive(function () {
          if (eachView.expandedValueDep) {
            eachView.expandedValueDep.changed();
          } else if (eachView.domrange) {
            eachView.domrange.moveMember(fromIndex, toIndex);
          } else {
            var subviews = eachView.initialSubviews;
            var itemView = subviews[fromIndex];
            subviews.splice(fromIndex, 1);
            subviews.splice(toIndex, 0, itemView);
          }
        });
      }
    });

    if (eachView.elseFunc && eachView.numItems === 0) {
      eachView.inElseMode = true;
      eachView.initialSubviews[0] =
        Blaze.View('each_else', eachView.elseFunc);
    }
  });

  eachView.onDestroyed(function () {
    if (eachView.stopHandle)
      eachView.stopHandle.stop();
  });

  return eachView;
};

Blaze.InOuterTemplateScope = function (templateView, contentFunc) {
  var view = Blaze.View('InOuterTemplateScope', contentFunc);
  var parentView = templateView.parentView;

  // Hack so that if you call `{{> foo bar}}` and it expands into
  // `{{#with bar}}{{> foo}}{{/with}}`, and then `foo` is a template
  // that inserts `{{> UI.contentBlock}}`, the data context for
  // `UI.contentBlock` is not `bar` but the one enclosing that.
  if (parentView.__isTemplateWith)
    parentView = parentView.parentView;

  view.onCreated(function () {
    this.originalParentView = this.parentView;
    this.parentView = parentView;
  });
  return view;
};
