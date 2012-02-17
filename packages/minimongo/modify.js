// XXX need a strategy for passing the binding of $ into this
// function, from the compiled selector
//
// maybe just {key.up.to.just.before.dollarsign: array_index}
//
// XXX atomicity: if one modification fails, do we roll back the whole
// change?
LocalCollection._modify = function (doc, mod) {
  var is_modifier = false;
  for (var k in mod) {
    // IE7 doesn't support indexing into strings (eg, k[0]), so use substr.
    // Too bad -- it's far slower:
    // http://jsperf.com/testing-the-first-character-of-a-string
    is_modifier = k.substr(0, 1) === '$';
    break; // just check the first key.
  }

  var new_doc;

  if (!is_modifier) {
    if (mod._id && doc._id !== mod._id)
      throw Error("Cannot change the _id of a document");

    // replace the whole document
    for (var k in mod) {
      if (k.substr(0, 1) === '$')
        throw Error("Field name may not start with '$'");
      if (/\./.test(k))
        throw Error("Field name may not contain '.'");
    }
    new_doc = mod;
  } else {
    // apply modifiers
    var new_doc = LocalCollection._deepcopy(doc);

    for (var op in mod) {
      var mod_func = LocalCollection._modifiers[op];
      if (!mod_func)
        throw Error("Invalid modifier specified " + op);
      for (var keypath in mod[op]) {
        // XXX mongo doesn't allow mod field names to end in a period,
        // but I don't see why.. it allows '' as a key, as does JS
        if (keypath.length && keypath[keypath.length-1] === '.')
          throw Error("Invalid mod field name, may not end in a period");

        var arg = mod[op][keypath];
        var keyparts = keypath.split('.');
        var no_create = !!LocalCollection._noCreateModifiers[op];
        var forbid_array = (op === "$rename");
        var target = LocalCollection._findModTarget(new_doc, keyparts,
                                                    no_create, forbid_array);
        var field = keyparts.pop();
        mod_func(target, field, arg, keypath, new_doc);
      }
    }
  }

  // move new document into place
  for (var k in doc) {
    if (k !== '_id')
      delete doc[k];
  }
  for (var k in new_doc) {
    doc[k] = new_doc[k];
  }
};

// for a.b.c.2.d.e, keyparts should be ['a', 'b', 'c', '2', 'd', 'e'],
// and then you would operate on the 'e' property of the returned
// object. if no_create is falsey, creates intermediate levels of
// structure as necessary, like mkdir -p (and raises an exception if
// that would mean giving a non-numeric property to an array.) if
// no_create is true, return undefined instead. may modify the last
// element of keyparts to signal to the caller that it needs to use a
// different value to index into the returned object (for example,
// ['a', '01'] -> ['a', 1]). if forbid_array is true, return null if
// the keypath goes through an array.
LocalCollection._findModTarget = function (doc, keyparts, no_create,
                                      forbid_array) {
  for (var i = 0; i < keyparts.length; i++) {
    var last = (i === keyparts.length - 1);
    var keypart = keyparts[i];
    var numeric = /^[0-9]+$/.test(keypart);
    if (no_create && (!(typeof doc === "object") || !(keypart in doc)))
      return undefined;
    if (doc instanceof Array) {
      if (forbid_array)
        return null;
      if (!numeric)
        throw Error("can't append to array using string field name ["
                    + keypart + "]");
      keypart = parseInt(keypart);
      if (last)
        // handle 'a.01'
        keyparts[i] = keypart;
      while (doc.length < keypart)
        doc.push(null);
      if (!last) {
        if (doc.length === keypart)
          doc.push({});
        else if (typeof doc[keypart] !== "object")
          throw Error("can't modify field '" + keyparts[i + 1] +
                      "' of list value " + JSON.stringify(doc[keypart]));
      }
    } else {
      // XXX check valid fieldname (no $ at start, no .)
      if (!last && !(keypart in doc))
        doc[keypart] = {};
    }

    if (last)
      return doc;
    doc = doc[keypart];
  }

  // notreached
};

LocalCollection._noCreateModifiers = {
  $unset: true,
  $pop: true,
  $rename: true,
  $pull: true,
  $pullAll: true
};

LocalCollection._modifiers = {
  $inc: function (target, field, arg) {
    if (typeof arg !== "number")
      throw Error("Modifier $inc allowed for numbers only");
    if (field in target) {
      if (typeof target[field] !== "number")
        throw Error("Cannot apply $inc modifier to non-number");
      target[field] += arg;
    } else {
      target[field] = arg;
    }
  },
  $set: function (target, field, arg) {
    target[field] = LocalCollection._deepcopy(arg);
  },
  $unset: function (target, field, arg) {
    if (target !== undefined) {
      if (target instanceof Array) {
        if (field in target)
          target[field] = null;
      } else
        delete target[field];
    }
  },
  $push: function (target, field, arg) {
    var x = target[field];
    if (x === undefined)
      target[field] = [arg];
    else if (!(x instanceof Array))
      throw Error("Cannot apply $push modifier to non-array");
    else
      x.push(LocalCollection._deepcopy(arg));
  },
  $pushAll: function (target, field, arg) {
    if (!(typeof arg === "object" && arg instanceof Array))
      throw Error("Modifier $pushAll/pullAll allowed for arrays only");
    var x = target[field];
    if (x === undefined)
      target[field] = arg;
    else if (!(x instanceof Array))
      throw Error("Cannot apply $pushAll modifier to non-array");
    else {
      for (var i = 0; i < arg.length; i++)
        x.push(arg[i]);
    }
  },
  $addToSet: function (target, field, arg) {
    var x = target[field];
    if (x === undefined)
      target[field] = [arg];
    else if (!(x instanceof Array))
      throw Error("Cannot apply $addToSet modifier to non-array");
    else {
      var isEach = false;
      if (typeof arg === "object") {
        for (var k in arg) {
          if (k === "$each")
            isEach = true;
          break;
        }
      }
      var values = isEach ? arg["$each"] : [arg];
      _.each(values, function (value) {
        for (var i = 0; i < x.length; i++)
          if (LocalCollection._f._equal(value, x[i]))
            return;
        x.push(value);
      });
    }
  },
  $pop: function (target, field, arg) {
    if (target === undefined)
      return;
    var x = target[field];
    if (x === undefined)
      return;
    else if (!(x instanceof Array))
      throw Error("Cannot apply $pop modifier to non-array");
    else {
      if (typeof arg === 'number' && arg < 0)
        x.splice(0, 1);
      else
        x.pop();
    }
  },
  $pull: function (target, field, arg) {
    if (target === undefined)
      return;
    var x = target[field];
    if (x === undefined)
      return;
    else if (!(x instanceof Array))
      throw Error("Cannot apply $pull/pullAll modifier to non-array");
    else {
      var out = []
      if (typeof arg === "object" && !(arg instanceof Array)) {
        // XXX would be much nicer to compile this once, rather than
        // for each document we modify.. but usually we're not
        // modifying that many documents, so we'll let it slide for
        // now

        // XXX _compileSelector isn't up for the job, because we need
        // to permit stuff like {$pull: {a: {$gt: 4}}}.. something
        // like {$gt: 4} is not normally a complete selector.
        // same issue as $elemMatch possibly?
        var match = LocalCollection._compileSelector(arg);
        for (var i = 0; i < x.length; i++)
          if (!match(x[i]))
            out.push(x[i])
      } else {
        for (var i = 0; i < x.length; i++)
          if (!LocalCollection._f._equal(x[i], arg))
            out.push(x[i]);
      }
      target[field] = out;
    }
  },
  $pullAll: function (target, field, arg) {
    if (!(typeof arg === "object" && arg instanceof Array))
      throw Error("Modifier $pushAll/pullAll allowed for arrays only");
    if (target === undefined)
      return;
    var x = target[field];
    if (x === undefined)
      return;
    else if (!(x instanceof Array))
      throw Error("Cannot apply $pull/pullAll modifier to non-array");
    else {
      var out = []
      for (var i = 0; i < x.length; i++) {
        var exclude = false;
        for (var j = 0; j < arg.length; j++) {
          if (LocalCollection._f._equal(x[i], arg[j])) {
            exclude = true;
            break;
          }
        }
        if (!exclude)
          out.push(x[i]);
      }
      target[field] = out;
    }
  },
  $rename: function (target, field, arg, keypath, doc) {
    if (keypath === arg)
      // no idea why mongo has this restriction..
      throw Error("$rename source must differ from target");
    if (target === null)
      throw Error("$rename source field invalid");
    if (typeof arg !== "string")
      throw Error("$rename target must be a string");
    if (target === undefined)
      return;
    var v = target[field];
    delete target[field];

    var keyparts = arg.split('.');
    var target2 = LocalCollection._findModTarget(doc, keyparts, false, true);
    if (target2 === null)
      throw Error("$rename target field invalid");
    var field2 = keyparts.pop();
    target2[field2] = v;
  },
  $bit: function (target, field, arg) {
    // XXX mongo only supports $bit on integers, and we only support
    // native javascript numbers (doubles) so far, so we can't support $bit
    throw Error("$bit is not supported");
  }
};
