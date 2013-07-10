var Component = UIComponent;

_UI.Each = Component.extend({
  typeName: 'Each',
  render: function (buf) {
    var self = this;

    // XXX support arrays too.
    // For now, we assume the data is a database cursor.
    var cursor = self.data();
    // XXX also support `null`

    

    var self = this;
    buf(self.content(function () { return 0; })),
    buf(self.content(function () { return 1; }));
    buf(self.content(function () { return 2; }));
  }
});


// Function equal to LocalCollection._idStringify, or the identity
// function if we don't have LiveData.  Converts item keys (i.e. DDP
// keys) to strings for storage in an OrderedDict.
var idStringify;

// XXX not clear if this is the right way to do a weak dependency
// now, post-linker
if (typeof LocalCollection !== 'undefined') {
  idStringify = function (id) {
    if (id === null)
      return id;
    else
      return LocalCollection._idStringify(id);
  };
} else {
  idStringify = function (id) { return id; };
}

// XXX duplicated code from minimongo.js.
var applyChanges = function (doc, changeFields) {
  _.each(changeFields, function (value, key) {
    if (value === undefined)
      delete doc[key];
    else
      doc[key] = value;
  });
};
