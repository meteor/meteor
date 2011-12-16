// Possible optimization: Just keep a count for _leave (losing the
// ability to detect overlapping ranges)

// can also pass just one node, or a document/documentfragment
LiveRange = function (start, end) {
  if ((start instanceof Document) || (start instanceof DocumentFragment)) {
    end = start.lastChild;
    start = start.firstChild;
  }
  end = end || start;

  // this._start is the node N such that we begin before N, but not
  // before the node before N in the preorder traversal of the
  // document (if there is such a node.) this._start._enter will be
  // the list of all LiveRanges for which this._start is N, including
  // us, sorted in the order that the ranges start. and finally,
  // this._start[this._start_idx] === this.
  this._start = start;
  if (!('_enter' in start))
    start._enter = [];
  this._start_idx = start._enter.length;
  start._enter.push(this);

  // just like this._end, except it's the node N such that we end
  // after N, but not after the node after N in the postorder
  // traversal; and the attribute on the node is called _leave instead
  // of _enter, and it's sorted in the order that the ranges end.
  this._end = end;
  if (!('_leave' in end))
    start._leave = [];
  this._end_idx = 0;
  start._leave.splice(0, 0, this);
};

LiveRange.prototype.destroy = function () {
  this._start._enter.splice(this._start_idx, 1);
  if (!this._start._enter.length)
    delete this._start._enter;

  this._end._leave.splice(this._end_idx, 1);
  if (!this._end._leave.length)
    delete this._end._leave;
};

LiveRange.prototype.contained = function () {
  // visit() is invoked for each node start-point or end-point that we
  // encounter as we walk the range stored in 'this' (not counting the
  // endpoints of 'this' itself.)
  var result = {children: []};
  var stack = [result];
  var visit = function (is_start, range) {
    if (is_start) {
      var record = {range: range, children: []};
      stack[stack.length - 1].children.push(record);
      stack.push(record);
    } else
      if (stack.pop().range !== range)
        throw new Error("Overlapping ranges detected");
  };

  var traverse = function (node) {
    if (node._enter)
      for (var i = 0; i < node._enter.length; i++)
        visit(true, node._enter[i]);
    for (var walk = node.firstChild; walk; walk = walk.nextSibling)
      traverse(walk);
    if (node._leave)
      for (var i = 0; i < node._leave.length; i++)
        visit(node, walk._leave[i]);
  };

  var walk = this._start;
  for (var i = this._start_idx + 1; i < walk._enter.length; i++)
    visit(true, walk._enter[i]);

  while (true) {
    traverse(walk);
    if (walk === this._end)
      break;
    walk = walk.nextSibling;
  }

  for (var i = 0; i < walk._end_idx; i++)
    visit(false, walk._enter[i]);

  return result.children;
};

LiveRange.prototype.replace = function (new_frag) {
  if (!new_frag.firstChild)
    throw new Error("Ranges must contain at least one element");

  // Fix up range pointers on departing fragment
  var old_enter = this._start._enter;
  var save_enter = old_enter.splice(0, this._start_idx + 1);
  for (var i = 0; i < old_enter.length; i++)
    old_enter[i]._start_idx = i;

  var old_leave = this._end._leave;
  var save_leave = old_leave.splice(this._end_idx, old_leave.length);

  // Insert new fragment
  var new_start = new_frag.firstChild;
  var new_end = new_frag.lastChild;
  this._start.parentNode.insertBefore(new_frag, this._start);

  // Pull out departing fragment
  // Possible optimization: use W3C Ranges on browsers that support them
  var ret = this._start.ownerDocument.createDocumentFragment();
  var walk = this._start;
  while (true) {
    var next = walk.nextSibling;
    ret.appendChild(walk);
    if (walk === this._end)
      break;
    walk = next;
  }

  // Fix up range pointers on new fragment -- including our own
  // Clobbers this._start[_idx], this._end[_idx]
  var new_enter = new_start._enter;
  Array.prototype.splice.apply(new_enter, [0, 0].concat(save_enter));
  for (var i = 0; i < new_enter.length; i++) {
    new_enter[i]._start = new_start;
    new_enter[i]._start_idx = i;
  }

  var new_leave = new_end._leave;
  for (var i = 0; i < save_leave.length; i++) {
    save_leave[i]._end = new_end;
    save_leave[i]._end_idx = new_leave.length + i;
  }
  Array.prototype.push.apply(new_leave, save_leave);

  return ret;
};
