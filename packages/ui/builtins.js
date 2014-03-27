
UI.If = function (argFunc, contentBlock, elseContentBlock) {
  checkBlockHelperArguments('If', argFunc, contentBlock, elseContentBlock);

  var f = function () {
    var emboxedCondition = emboxCondition(argFunc);
    f.stop = function () {
      emboxedCondition.stop();
    };
    if (emboxedCondition())
      return contentBlock;
    else
      return elseContentBlock || null;
  };

  return f;
};


UI.Unless = function (argFunc, contentBlock, elseContentBlock) {
  checkBlockHelperArguments('Unless', argFunc, contentBlock, elseContentBlock);

  var f = function () {
    var emboxedCondition = emboxCondition(argFunc);
    f.stop = function () {
      emboxedCondition.stop();
    };
    if (! emboxedCondition())
      return contentBlock;
    else
      return elseContentBlock || null;
  };

  return f;
};

// Returns true if `a` and `b` are `===`, unless they are of a mutable type.
// (Because then, they may be equal references to an object that was mutated,
// and we'll never know.  We save only a reference to the old object; we don't
// do any deep-copying or diffing.)
var safeEquals = function (a, b) {
  if (a !== b)
    return false;
  else
    return ((!a) || (typeof a === 'number') || (typeof a === 'boolean') ||
            (typeof a === 'string'));
};

// Unlike Spacebars.With, there's no else case and no conditional logic.
//
// We don't do any reactive emboxing of `argFunc` here; it should be done
// by the caller if efficiency and/or number of calls to the data source
// is important.
UI.With = function (argFunc, contentBlock) {
  checkBlockHelperArguments('With', argFunc, contentBlock);

  var block = contentBlock;
  if ('data' in block) {
    // XXX TODO: get religion about where `data` property goes
    block = UI.block(function () {
      return contentBlock;
    });
  }

  block.data = function () {
    throw new Error("Can't get data for component kind");
  };

  block.init = function () {
    this.data = UI.emboxValue(argFunc, safeEquals);
  };

  block.materialized = function () {
    var self = this;
    if (Deps.active) {
      Deps.onInvalidate(function () {
        self.data.stop();
      });
    }
  };
  block.materialized.isWith = true;

  return block;
};

UI.Each = function (argFunc, contentBlock, elseContentBlock) {
  checkBlockHelperArguments('Each', argFunc, contentBlock, elseContentBlock);

  return UI.EachImpl.extend({
    __sequence: argFunc,
    __content: contentBlock,
    __elseContent: elseContentBlock
  });
};

var checkBlockHelperArguments = function (which, argFunc, contentBlock, elseContentBlock) {
  if (typeof argFunc !== 'function')
    throw new Error('First argument to ' + which + ' must be a function');
  if (! UI.isComponent(contentBlock))
    throw new Error('Second argument to ' + which + ' must be a template or UI.block');
  if (elseContentBlock && ! UI.isComponent(elseContentBlock))
    throw new Error('Third argument to ' + which + ' must be a template or UI.block if present');
};

// Returns a function that computes `!! conditionFunc()` except:
//
// - Empty array is considered falsy
// - The result is UI.emboxValue'd (doesn't trigger invalidation
//   as long as the condition stays truthy or stays falsy)
var emboxCondition = function (conditionFunc) {
  return UI.namedEmboxValue('if/unless', function () {
    // `condition` is emboxed; it is always a function,
    // and it only triggers invalidation if its return
    // value actually changes.  We still need to isolate
    // the calculation of whether it is truthy or falsy
    // in order to not re-render if it changes from one
    // truthy or falsy value to another.
    var cond = conditionFunc();

    // empty arrays are treated as falsey values
    if (cond instanceof Array && cond.length === 0)
      return false;
    else
      return !! cond;
  });
};
