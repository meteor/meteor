// _assign is like _.extend or the upcoming Object.assign.
// Copy src's own, enumerable properties onto tgt and return
// tgt.
var _hasOwnProperty = Object.prototype.hasOwnProperty;
var _assign = function (tgt, src) {
  for (var k in src) {
    if (_hasOwnProperty.call(src, k))
      tgt[k] = src[k];
  }
  return tgt;
};


HTMLTools.TemplateTag = function (props) {
  if (! (this instanceof HTMLTools.TemplateTag))
    // called without `new`
    return new HTMLTools.TemplateTag;

  if (props)
    _assign(this, props);
};

_assign(HTMLTools.TemplateTag.prototype, {
  constructorName: 'HTMLTools.TemplateTag',
  toJS: function (visitor) {
    return visitor.generateCall(this.constructorName,
                                _assign({}, this));
  }
});
