(function () {

///////////////////////////////////////////////////////////////////////////////////
//                                                                               //
// packages/liverange/liverange.js                                               //
//                                                                               //
///////////////////////////////////////////////////////////////////////////////////
                                                                                 //
// Stand back, I'm going to try SCIENCE.                                         // 1
                                                                                 // 2
// Possible optimization: get rid of _startIndex/_endIndex and just search       // 3
// the list. Not clear which strategy will be faster.                            // 4
                                                                                 // 5
// Possible extension: could allow zero-length ranges is some cases,             // 6
// by encoding both 'enter' and 'leave' type events in the same list             // 7
                                                                                 // 8
var canSetTextProps = (function () {                                             // 9
  // IE8 and earlier don't support expando attributes on text nodes,             // 10
  // but fortunately they are allowed on comments.                               // 11
  var testElem = document.createTextNode("");                                    // 12
  var exception;                                                                 // 13
  try {                                                                          // 14
    testElem.test = 123;                                                         // 15
  } catch (exception) { }                                                        // 16
  if (testElem.test !== 123)                                                     // 17
    return false;                                                                // 18
                                                                                 // 19
  // IE9 and 10 have a weird issue with multiple text nodes next to              // 20
  // each other losing their expando attributes. Use the same                    // 21
  // workaround as IE8. Not sure how to test this as a feature, so use           // 22
  // browser detection instead.                                                  // 23
  // See https://github.com/meteor/meteor/issues/458                             // 24
  if (document.documentMode)                                                     // 25
    return false;                                                                // 26
                                                                                 // 27
  return true;                                                                   // 28
})();                                                                            // 29
                                                                                 // 30
var wrapEndpoints = function (start, end) {                                      // 31
  if (canSetTextProps) {                                                         // 32
    return [start, end];                                                         // 33
  } else {                                                                       // 34
    // IE8 workaround: insert some empty comments.                               // 35
    // Comments whose text is "IE" are stripped out                              // 36
    // in cross-browser testing.                                                 // 37
    if (start.nodeType === 3 /* text node */) {                                  // 38
      var placeholder = document.createComment("IE");                            // 39
      start.parentNode.insertBefore(placeholder, start);                         // 40
      start = placeholder;                                                       // 41
    }                                                                            // 42
    if (end.nodeType === 3 /* text node */) {                                    // 43
      var placeholder = document.createComment("IE");                            // 44
      end.parentNode.insertBefore(placeholder, end.nextSibling);                 // 45
      end = placeholder;                                                         // 46
    }                                                                            // 47
    return [start, end];                                                         // 48
  }                                                                              // 49
};                                                                               // 50
                                                                                 // 51
                                                                                 // 52
// This is a constructor (invoke it as 'new LiveRange').                         // 53
//                                                                               // 54
// Create a range, tagged 'tag', that includes start, end, and all               // 55
// the nodes between them, and the children of all of those nodes,               // 56
// but includes no other nodes. If there are other ranges tagged                 // 57
// 'tag' that contain this exact set of nodes, then: if inner is                 // 58
// false (the default), the new range will be outside all of them                // 59
// (will contain all of them), or if inner is true, then it will be              // 60
// inside all of them (be contained by all of them.) If there are no             // 61
// other ranges tagged 'tag' that contain this exact set of nodes,               // 62
// then 'inner' is ignored because the nesting of the new range with             // 63
// respect to other ranges is uniquely determined. (Nesting of                   // 64
// ranges with different tags is undefined.)                                     // 65
//                                                                               // 66
// To track the range as it's relocated, some of the DOM nodes that              // 67
// are part of the range will have an expando attribute set on                   // 68
// them. The name of the expando attribute will be the value of                  // 69
// 'tag', so pick something that won't collide.                                  // 70
//                                                                               // 71
// Instead of start and end, you can pass a document or                          // 72
// documentfragment for start and leave end undefined. Or you can                // 73
// pass a node for start and leave end undefined, in which case end              // 74
// === start. If start and end are distinct nodes, they must be                  // 75
// siblings.                                                                     // 76
//                                                                               // 77
// You can set any attributes you like on the returned LiveRange                 // 78
// object, with two exceptions. First, attribute names that start                // 79
// with '_' are reserved. Second, the attribute 'tag' contains the               // 80
// tag name of this range and mustn't be changed.                                // 81
//                                                                               // 82
// It would be possible to add a fast path through this function                 // 83
// when caller can promise that there is no range that starts on                 // 84
// start that does not end by end, and vice versa. eg: when start                // 85
// and end are the first and last child of their parent respectively             // 86
// or when caller is building up the range tree from the inside                  // 87
// out. Let's wait for the profiler to tell us to add this.                      // 88
//                                                                               // 89
// XXX Should eventually support LiveRanges where start === end                  // 90
// and start.parentNode is null.                                                 // 91
LiveRange = function (tag, start, end, inner) {                                  // 92
  if (start.nodeType === 11 /* DocumentFragment */) {                            // 93
    end = start.lastChild;                                                       // 94
    start = start.firstChild;                                                    // 95
  } else {                                                                       // 96
    if (! start.parentNode)                                                      // 97
      throw new Error("LiveRange start and end must have a parent");             // 98
  }                                                                              // 99
  end = end || start;                                                            // 100
                                                                                 // 101
  this.tag = tag; // must be set before calling _ensureTag                       // 102
                                                                                 // 103
  var endpoints = wrapEndpoints(start, end);                                     // 104
  start = this._ensureTag(endpoints[0]);                                         // 105
  end = this._ensureTag(endpoints[1]);                                           // 106
                                                                                 // 107
  // Decide at what indices in start[tag][0] and end[tag][1] we                  // 108
  // should insert the new range.                                                // 109
  //                                                                             // 110
  // The start[tag][0] array lists the other ranges that start at                // 111
  // `start`, and we must choose an insertion index that puts us                 // 112
  // inside the ones that end at later siblings, and outside the ones            // 113
  // that end at earlier siblings.  The ones that end at the same                // 114
  // sibling (i.e. share both our start and end) we must be inside               // 115
  // or outside of depending on `inner`.  The array lists ranges                 // 116
  // from the outside in.                                                        // 117
  //                                                                             // 118
  // The same logic applies to end[tag][1], which lists the other ranges         // 119
  // that happen to end at `end` from in the inside out.                         // 120
  //                                                                             // 121
  // Liveranges technically start just before, and end just after, their         // 122
  // start and end nodes to which the liverange data is attached.                // 123
                                                                                 // 124
  var startIndex = findPosition(start[tag][0], true, end, start, inner);         // 125
  var endIndex = findPosition(end[tag][1], false, start, end, inner);            // 126
                                                                                 // 127
  // this._start is the node N such that we begin before N, but not              // 128
  // before the node before N in the preorder traversal of the                   // 129
  // document (if there is such a node.) this._start[this.tag][0]                // 130
  // will be the list of all LiveRanges for which this._start is N,              // 131
  // including us, sorted in the order that the ranges start. and                // 132
  // finally, this._startIndex is the value such that                            // 133
  // this._start[this.tag][0][this._startIndex] === this.                        // 134
  //                                                                             // 135
  // Similarly for this._end, except it's the node N such that we end            // 136
  // after N, but not after the node after N in the postorder                    // 137
  // traversal; and the data is stored in this._end[this.tag][1], and            // 138
  // it's sorted in the order that the ranges end.                               // 139
                                                                                 // 140
  // Set this._start, this._end, this._startIndex, this._endIndex                // 141
  this._insertEntries(start, 0, startIndex, [this]);                             // 142
  this._insertEntries(end, 1, endIndex, [this]);                                 // 143
};                                                                               // 144
                                                                                 // 145
var findPosition = function(ranges, findEndNotStart, edge, otherEdge, inner) {   // 146
  var index;                                                                     // 147
  // For purpose of finding where we belong in start[tag][0],                    // 148
  // walk the array and determine where we start to see ranges                   // 149
  // end at `end` (==edge) or earlier.  For the purpose of finding               // 150
  // where we belong in end[tag][1], walk the array and determine                // 151
  // where we start to see ranges start at `start` (==edge) or                   // 152
  // earlier.  In both cases, we slide a sibling pointer backwards               // 153
  // looking for `edge`, though the details are slightly different.              // 154
  //                                                                             // 155
  // Use `inner` to take first or last candidate index for insertion.            // 156
  // Candidate indices are:  Right before a range whose edge is `edge`           // 157
  // (i.e., a range with same start and end as we are creating),                 // 158
  // or the index where ranges start to have edges earlier than `edge`           // 159
  // (treating the end of the list as such an index).  We detect the             // 160
  // latter case when `n` hits `edge` without hitting the edge of the            // 161
  // current range; that is, it is about to move past `edge`.  This is           // 162
  // always an appropriate time to stop.                                         // 163
  //                                                                             // 164
  // Joint traversal of the array and DOM should be fast.  The most              // 165
  // expensive thing to happen would be a single walk from lastChild             // 166
  // to end looking for range ends, or from end to start looking for             // 167
  // range starts.                                                               // 168
  //                                                                             // 169
  // invariant: n >= edge ("n is after, or is, edge")                            // 170
  var initialN = (findEndNotStart ? edge.parentNode.lastChild : otherEdge);      // 171
  var takeFirst = (findEndNotStart ? ! inner : inner);                           // 172
  for(var i=0, n=initialN; i<=ranges.length; i++) {                              // 173
    var r = ranges[i];                                                           // 174
    var curEdge = r && (findEndNotStart ? r._end : r._start);                    // 175
    while (n !== curEdge && n !== edge) {                                        // 176
      n = n.previousSibling;                                                     // 177
    }                                                                            // 178
    if (curEdge === edge) {                                                      // 179
      index = i;                                                                 // 180
      if (takeFirst) break;                                                      // 181
    } else if (n === edge) {                                                     // 182
      index = i;                                                                 // 183
      break;                                                                     // 184
    }                                                                            // 185
  }                                                                              // 186
  return index;                                                                  // 187
};                                                                               // 188
                                                                                 // 189
LiveRange.prototype._ensureTag = function (node) {                               // 190
  if (!(this.tag in node))                                                       // 191
    node[this.tag] = [[], []];                                                   // 192
  return node;                                                                   // 193
};                                                                               // 194
                                                                                 // 195
var canDeleteExpandos = (function() {                                            // 196
  // IE7 can't remove expando attributes from DOM nodes with                     // 197
  // delete. Instead you must remove them with node.removeAttribute.             // 198
  var node = document.createElement("DIV");                                      // 199
  var exception;                                                                 // 200
  var result = false;                                                            // 201
  try {                                                                          // 202
    node.test = 12;                                                              // 203
    delete node.test;                                                            // 204
    result = true;                                                               // 205
  } catch (exception) { }                                                        // 206
  return result;                                                                 // 207
})();                                                                            // 208
                                                                                 // 209
LiveRange._cleanNode = function (tag, node, force) {                             // 210
  var data = node[tag];                                                          // 211
  if (data && (!(data[0].length + data[1].length) || force)) {                   // 212
    if (canDeleteExpandos)                                                       // 213
      delete node[tag];                                                          // 214
    else                                                                         // 215
      node.removeAttribute(tag);                                                 // 216
  }                                                                              // 217
};                                                                               // 218
                                                                                 // 219
// Delete a LiveRange. This is analogous to removing a DOM node from             // 220
// its parent -- it will no longer appear when traversing the tree               // 221
// with visit().                                                                 // 222
//                                                                               // 223
// On modern browsers there is no requirement to delete LiveRanges on            // 224
// defunct nodes. They will be garbage collected just like any other             // 225
// object. However, on old versions of IE, you probably do need to               // 226
// manually remove all ranges because IE can't GC reference cycles               // 227
// through the DOM.                                                              // 228
//                                                                               // 229
// Pass true for `recursive` to also destroy all descendent ranges.              // 230
LiveRange.prototype.destroy = function (recursive) {                             // 231
  var self = this;                                                               // 232
                                                                                 // 233
  if (recursive) {                                                               // 234
    // recursive case: destroy all descendent ranges too                         // 235
    // (more efficient than actually recursing)                                  // 236
                                                                                 // 237
    this.visit(function(isStart, range) {                                        // 238
      if (isStart) {                                                             // 239
        range._start = null;                                                     // 240
        range._end = null;                                                       // 241
      }                                                                          // 242
    }, function(isStart, node) {                                                 // 243
      if (! isStart) {                                                           // 244
        // when leaving a node, force-clean its children                         // 245
        for(var n = node.firstChild; n; n = n.nextSibling) {                     // 246
          LiveRange._cleanNode(self.tag, n, true);                               // 247
        }                                                                        // 248
      }                                                                          // 249
    });                                                                          // 250
                                                                                 // 251
    this._removeEntries(this._start, 0, this._startIndex);                       // 252
    this._removeEntries(this._end, 1, 0, this._endIndex + 1);                    // 253
                                                                                 // 254
    if (this._start !== this._end) {                                             // 255
      // force-clean the top-level nodes in this, besides _start and _end        // 256
      for(var n = this._start.nextSibling;                                       // 257
          n !== this._end;                                                       // 258
          n = n.nextSibling) {                                                   // 259
        LiveRange._cleanNode(self.tag, n, true);                                 // 260
      }                                                                          // 261
                                                                                 // 262
      // clean ends on this._start and starts on this._end                       // 263
      if (this._start[self.tag])                                                 // 264
        this._removeEntries(this._start, 1);                                     // 265
      if (this._end[self.tag])                                                   // 266
        this._removeEntries(this._end, 0);                                       // 267
    }                                                                            // 268
                                                                                 // 269
    this._start = this._end = null;                                              // 270
                                                                                 // 271
  } else {                                                                       // 272
    this._removeEntries(this._start, 0, this._startIndex, this._startIndex + 1); // 273
    this._removeEntries(this._end, 1, this._endIndex, this._endIndex + 1);       // 274
    this._start = this._end = null;                                              // 275
  }                                                                              // 276
};                                                                               // 277
                                                                                 // 278
// Return the first node in the range (in preorder traversal)                    // 279
LiveRange.prototype.firstNode = function () {                                    // 280
  return this._start;                                                            // 281
};                                                                               // 282
                                                                                 // 283
// Return the last node in the range (in postorder traversal)                    // 284
LiveRange.prototype.lastNode = function () {                                     // 285
  return this._end;                                                              // 286
};                                                                               // 287
                                                                                 // 288
// Return the node that immediately contains this LiveRange, that is,            // 289
// the parentNode of firstNode and lastNode.                                     // 290
LiveRange.prototype.containerNode = function() {                                 // 291
  return this._start.parentNode;                                                 // 292
};                                                                               // 293
                                                                                 // 294
// Walk through the current contents of a LiveRange, enumerating                 // 295
// either the contained ranges (with the same tag as this range),                // 296
// the contained elements, or both.                                              // 297
//                                                                               // 298
// visitRange(isStart, range) is invoked for each range                          // 299
// start-point or end-point that we encounter as we walk the range               // 300
// stored in 'this' (not counting the endpoints of 'this' itself.)               // 301
// visitNode(isStart, node) is similar but for nodes.  Both                      // 302
// functions are optional.                                                       // 303
//                                                                               // 304
// If you return false (i.e. a value === false) from visitRange                  // 305
// or visitNode when isStart is true, the children of that range                 // 306
// or node are skipped, and the next callback will be the same                   // 307
// range or node with isStart false.                                             // 308
//                                                                               // 309
// If you create or destroy ranges with this tag from a visitation               // 310
// function, results are undefined!                                              // 311
LiveRange.prototype.visit = function(visitRange, visitNode) {                    // 312
  visitRange = visitRange || function() {};                                      // 313
  visitNode = visitNode || function() {};                                        // 314
                                                                                 // 315
  var tag = this.tag;                                                            // 316
                                                                                 // 317
  var recurse = function(start, end, startRangeSkip) {                           // 318
    var startIndex = startRangeSkip || 0;                                        // 319
    var after = end.nextSibling;                                                 // 320
    for(var n = start; n && n !== after; n = n.nextSibling) {                    // 321
      var startData = n[tag] && n[tag][0];                                       // 322
      if (startData && startIndex < startData.length) {                          // 323
        // immediate child range that starts with n                              // 324
        var range = startData[startIndex];                                       // 325
        // be robust if visitRange mutates _start or _end;                       // 326
        // useful in destroy(true)                                               // 327
        var rangeStart = range._start;                                           // 328
        var rangeEnd = range._end;                                               // 329
        if (visitRange(true, range) !== false)                                   // 330
          recurse(rangeStart, rangeEnd, startIndex+1);                           // 331
        visitRange(false, range);                                                // 332
        n = rangeEnd;                                                            // 333
      } else {                                                                   // 334
        // bare node                                                             // 335
        if (visitNode(true, n) !== false && n.firstChild)                        // 336
          recurse(n.firstChild, n.lastChild);                                    // 337
        visitNode(false, n);                                                     // 338
      }                                                                          // 339
      startIndex = 0;                                                            // 340
    }                                                                            // 341
  };                                                                             // 342
                                                                                 // 343
  recurse(this._start, this._end, this._startIndex + 1);                         // 344
};                                                                               // 345
                                                                                 // 346
// startEnd === 0 for starts, 1 for ends                                         // 347
LiveRange.prototype._removeEntries =                                             // 348
  function(node, startEnd, i, j)                                                 // 349
{                                                                                // 350
  var entries = node[this.tag][startEnd];                                        // 351
  i = i || 0;                                                                    // 352
  j = (j || j === 0) ? j : entries.length;                                       // 353
  var removed = entries.splice(i, j-i);                                          // 354
  // fix up remaining ranges (not removed ones)                                  // 355
  for(var a = i; a < entries.length; a++) {                                      // 356
    if (startEnd) entries[a]._endIndex = a;                                      // 357
    else entries[a]._startIndex = a;                                             // 358
  }                                                                              // 359
                                                                                 // 360
  // potentially remove empty liverange data                                     // 361
  if (! entries.length) {                                                        // 362
    LiveRange._cleanNode(this.tag, node);                                        // 363
  }                                                                              // 364
                                                                                 // 365
  return removed;                                                                // 366
};                                                                               // 367
                                                                                 // 368
LiveRange.prototype._insertEntries =                                             // 369
  function(node, startEnd, i, newRanges)                                         // 370
{                                                                                // 371
  // insert the new ranges and "adopt" them by setting node pointers             // 372
  var entries = node[this.tag][startEnd];                                        // 373
  Array.prototype.splice.apply(entries, [i, 0].concat(newRanges));               // 374
  for(var a=i; a < entries.length; a++) {                                        // 375
    if (startEnd) {                                                              // 376
      entries[a]._end = node;                                                    // 377
      entries[a]._endIndex = a;                                                  // 378
    } else {                                                                     // 379
      entries[a]._start = node;                                                  // 380
      entries[a]._startIndex = a;                                                // 381
    }                                                                            // 382
  }                                                                              // 383
};                                                                               // 384
                                                                                 // 385
// Replace the contents of this range with the provided                          // 386
// DocumentFragment. Returns the previous contents as a                          // 387
// DocumentFragment.                                                             // 388
//                                                                               // 389
// "The right thing happens" with child LiveRanges:                              // 390
// - If there were child LiveRanges inside us, they will end up in               // 391
//   the returned DocumentFragment.                                              // 392
// - If the input DocumentFragment has LiveRanges, they will become              // 393
//   our children.                                                               // 394
//                                                                               // 395
// It is illegal for newFrag to be empty.                                        // 396
LiveRange.prototype.replaceContents = function (newFrag) {                       // 397
  if (! newFrag.firstChild)                                                      // 398
    throw new Error("replaceContents requires non-empty fragment");              // 399
                                                                                 // 400
  return this.operate(function(oldStart, oldEnd) {                               // 401
    // Insert new fragment                                                       // 402
    oldStart.parentNode.insertBefore(newFrag, oldStart);                         // 403
                                                                                 // 404
    // Pull out departing fragment                                               // 405
    // Possible optimization: use W3C Ranges on browsers that support them       // 406
    var retFrag = oldStart.ownerDocument.createDocumentFragment();               // 407
    var walk = oldStart;                                                         // 408
    while (true) {                                                               // 409
      var next = walk.nextSibling;                                               // 410
      retFrag.appendChild(walk);                                                 // 411
      if (walk === oldEnd)                                                       // 412
        break;                                                                   // 413
      walk = next;                                                               // 414
      if (!walk)                                                                 // 415
        throw new Error("LiveRanges must begin and end on siblings in order");   // 416
    }                                                                            // 417
                                                                                 // 418
    return retFrag;                                                              // 419
  });                                                                            // 420
};                                                                               // 421
                                                                                 // 422
                                                                                 // 423
// Perform a user-specified DOM mutation on the contents of this range.          // 424
//                                                                               // 425
// `func` is called with two parameters, `oldStart` and `oldEnd`, equal          // 426
// to the original firstNode() and lastNode() of this range.  `func` is allowed  // 427
// to perform arbitrary operations on the sequence of nodes from `oldStart`      // 428
// to `oldEnd` and on child ranges of this range.  `func` may NOT call methods   // 429
// on this range itself or otherwise rely on the existence of this range and     // 430
// enclosing ranges.  `func` must leave at least one node to become the new      // 431
// contents of this range.                                                       // 432
//                                                                               // 433
// The return value of `func` is returned.                                       // 434
//                                                                               // 435
// This method is a generalization of replaceContents that works by              // 436
// temporarily removing this LiveRange from the DOM and restoring it after       // 437
// `func` has been called.                                                       // 438
LiveRange.prototype.operate = function (func) {                                  // 439
  // boundary nodes of departing fragment                                        // 440
  var oldStart = this._start;                                                    // 441
  var oldEnd = this._end;                                                        // 442
                                                                                 // 443
  // pull off outer liverange data                                               // 444
  var outerStarts =                                                              // 445
        this._removeEntries(oldStart, 0, 0, this._startIndex + 1);               // 446
  var outerEnds =                                                                // 447
        this._removeEntries(oldEnd, 1, this._endIndex);                          // 448
                                                                                 // 449
  var containerNode = oldStart.parentNode;                                       // 450
  var beforeNode = oldStart.previousSibling;                                     // 451
  var afterNode = oldEnd.nextSibling;                                            // 452
                                                                                 // 453
  var ret = null;                                                                // 454
                                                                                 // 455
  // perform user-specifiedDOM manipulation                                      // 456
  ret = func(oldStart, oldEnd);                                                  // 457
                                                                                 // 458
  // see what we've got...                                                       // 459
                                                                                 // 460
  var newStart =                                                                 // 461
        beforeNode ? beforeNode.nextSibling : containerNode.firstChild;          // 462
  var newEnd =                                                                   // 463
        afterNode ? afterNode.previousSibling : containerNode.lastChild;         // 464
                                                                                 // 465
  if (! newStart || newStart === afterNode) {                                    // 466
    throw new Error("Ranges must contain at least one element");                 // 467
  }                                                                              // 468
                                                                                 // 469
  // wrap endpoints if necessary                                                 // 470
  var newEndpoints = wrapEndpoints(newStart, newEnd);                            // 471
  newStart = this._ensureTag(newEndpoints[0]);                                   // 472
  newEnd = this._ensureTag(newEndpoints[1]);                                     // 473
                                                                                 // 474
  // put the outer liveranges back                                               // 475
                                                                                 // 476
  this._insertEntries(newStart, 0, 0, outerStarts);                              // 477
  this._insertEntries(newEnd, 1, newEnd[this.tag][1].length, outerEnds);         // 478
                                                                                 // 479
  return ret;                                                                    // 480
};                                                                               // 481
                                                                                 // 482
// Move all liverange data represented in the DOM from sourceNode to             // 483
// targetNode.  targetNode must be capable of receiving liverange tags           // 484
// (for example, a node that has been the first or last node of a liverange      // 485
// before; not a text node in IE).                                               // 486
//                                                                               // 487
// This is a low-level operation suitable for moving liveranges en masse         // 488
// from one DOM tree to another, where transplantTag is called on every          // 489
// pair of nodes such that targetNode takes the place of sourceNode.             // 490
LiveRange.transplantTag = function(tag, targetNode, sourceNode) {                // 491
                                                                                 // 492
  if (! sourceNode[tag])                                                         // 493
    return;                                                                      // 494
                                                                                 // 495
  // copy data pointer                                                           // 496
  targetNode[tag] = sourceNode[tag];                                             // 497
  sourceNode[tag] = null;                                                        // 498
                                                                                 // 499
  var starts = targetNode[tag][0];                                               // 500
  var ends = targetNode[tag][1];                                                 // 501
                                                                                 // 502
  // fix _start and _end pointers                                                // 503
  for(var i=0;i<starts.length;i++)                                               // 504
    starts[i]._start = targetNode;                                               // 505
  for(var i=0;i<ends.length;i++)                                                 // 506
    ends[i]._end = targetNode;                                                   // 507
};                                                                               // 508
                                                                                 // 509
// Takes two sibling nodes tgtStart and tgtEnd with no LiveRange data on them    // 510
// and a LiveRange srcRange in a separate DOM tree.  Transplants srcRange        // 511
// to span from tgtStart to tgtEnd, and also copies info about enclosing ranges  // 512
// starting on srcRange._start or ending on srcRange._end.  tgtStart and tgtEnd  // 513
// must be capable of receiving liverange tags (for example, nodes that have     // 514
// held liverange data in the past; not text nodes in IE).                       // 515
//                                                                               // 516
// This is a low-level operation suitable for moving liveranges en masse         // 517
// from one DOM tree to another.                                                 // 518
LiveRange.transplantRange = function(tgtStart, tgtEnd, srcRange) {               // 519
  srcRange._ensureTag(tgtStart);                                                 // 520
  if (tgtEnd !== tgtStart)                                                       // 521
    srcRange._ensureTag(tgtEnd);                                                 // 522
                                                                                 // 523
  srcRange._insertEntries(                                                       // 524
    tgtStart, 0, 0,                                                              // 525
    srcRange._start[srcRange.tag][0].slice(0, srcRange._startIndex + 1));        // 526
  srcRange._insertEntries(                                                       // 527
    tgtEnd, 1, 0,                                                                // 528
    srcRange._end[srcRange.tag][1].slice(srcRange._endIndex));                   // 529
};                                                                               // 530
                                                                                 // 531
// Inserts a DocumentFragment immediately before this range.                     // 532
// The new nodes are outside this range but inside all                           // 533
// enclosing ranges.                                                             // 534
LiveRange.prototype.insertBefore = function(frag) {                              // 535
  var fragStart = frag.firstChild;                                               // 536
                                                                                 // 537
  if (! fragStart) // empty frag                                                 // 538
    return;                                                                      // 539
                                                                                 // 540
  // insert into DOM                                                             // 541
  this._start.parentNode.insertBefore(frag, this._start);                        // 542
                                                                                 // 543
  // move starts of ranges that begin on this._start, but are                    // 544
  // outside this, to beginning of fragStart                                     // 545
  this._ensureTag(fragStart);                                                    // 546
  this._insertEntries(fragStart, 0, 0,                                           // 547
                       this._removeEntries(this._start, 0, 0,                    // 548
                                            this._startIndex));                  // 549
};                                                                               // 550
                                                                                 // 551
// Inserts a DocumentFragment immediately after this range.                      // 552
// The new nodes are outside this range but inside all                           // 553
// enclosing ranges.                                                             // 554
LiveRange.prototype.insertAfter = function(frag) {                               // 555
  var fragEnd = frag.lastChild;                                                  // 556
                                                                                 // 557
  if (! fragEnd) // empty frag                                                   // 558
    return;                                                                      // 559
                                                                                 // 560
  // insert into DOM                                                             // 561
  this._end.parentNode.insertBefore(frag, this._end.nextSibling);                // 562
                                                                                 // 563
  // move ends of ranges that end on this._end, but are                          // 564
  // outside this, to end of fragEnd                                             // 565
  this._ensureTag(fragEnd);                                                      // 566
  this._insertEntries(fragEnd, 1, fragEnd[this.tag][1].length,                   // 567
                       this._removeEntries(this._end, 1,                         // 568
                                            this._endIndex + 1));                // 569
};                                                                               // 570
                                                                                 // 571
// Extracts this range and its contents from the DOM and                         // 572
// puts it into a DocumentFragment, which is returned.                           // 573
// All nodes and ranges outside this range are properly                          // 574
// preserved.                                                                    // 575
//                                                                               // 576
// Because liveranges must contain at least one node,                            // 577
// it is illegal to perform `extract` if the immediately                         // 578
// enclosing range would become empty.  If this precondition                     // 579
// is violated, no action is taken and null is returned.                         // 580
LiveRange.prototype.extract = function() {                                       // 581
  if (this._startIndex > 0 &&                                                    // 582
      this._start[this.tag][0][this._startIndex - 1]._end === this._end) {       // 583
    // immediately enclosing range wraps same nodes, so can't extract because    // 584
    // it would empty it.                                                        // 585
    return null;                                                                 // 586
  }                                                                              // 587
                                                                                 // 588
  var before = this._start.previousSibling;                                      // 589
  var after = this._end.nextSibling;                                             // 590
  var parent = this._start.parentNode;                                           // 591
                                                                                 // 592
  if (this._startIndex > 0) {                                                    // 593
    // must be a later node where outer ranges that start here end;              // 594
    // move their starts to after                                                // 595
    this._ensureTag(after);                                                      // 596
    this._insertEntries(after, 0, 0,                                             // 597
                         this._removeEntries(this._start, 0, 0,                  // 598
                                              this._startIndex));                // 599
  }                                                                              // 600
                                                                                 // 601
  if (this._endIndex < this._end[this.tag][1].length - 1) {                      // 602
    // must be an earlier node where outer ranges that end here                  // 603
    // start; move their ends to before                                          // 604
    this._ensureTag(before);                                                     // 605
    this._insertEntries(before, 1, before[this.tag][1].length,                   // 606
                         this._removeEntries(this._end, 1,                       // 607
                                              this._endIndex + 1));              // 608
  }                                                                              // 609
                                                                                 // 610
  var result = document.createDocumentFragment();                                // 611
                                                                                 // 612
  for(var n;                                                                     // 613
      n = before ? before.nextSibling : parent.firstChild,                       // 614
      n && n !== after;)                                                         // 615
    result.appendChild(n);                                                       // 616
                                                                                 // 617
  return result;                                                                 // 618
};                                                                               // 619
                                                                                 // 620
// Find the immediately enclosing parent range of this range, or                 // 621
// null if this range has no enclosing ranges.                                   // 622
//                                                                               // 623
// If `withSameContainer` is true, we stop looking when we reach                 // 624
// this range's container node (the parent of its endpoints) and                 // 625
// only return liveranges whose first and last nodes are siblings                // 626
// of this one's.                                                                // 627
LiveRange.prototype.findParent = function(withSameContainer) {                   // 628
  var result = enclosingRangeSearch(this.tag, this._end, this._endIndex);        // 629
  if (result)                                                                    // 630
    return result;                                                               // 631
                                                                                 // 632
  if (withSameContainer)                                                         // 633
    return null;                                                                 // 634
                                                                                 // 635
  return LiveRange.findRange(this.tag, this.containerNode());                    // 636
};                                                                               // 637
                                                                                 // 638
// Find the nearest enclosing range containing `node`, if any.                   // 639
LiveRange.findRange = function(tag, node) {                                      // 640
  var result = enclosingRangeSearch(tag, node);                                  // 641
  if (result)                                                                    // 642
    return result;                                                               // 643
                                                                                 // 644
  if (! node.parentNode)                                                         // 645
    return null;                                                                 // 646
                                                                                 // 647
  return LiveRange.findRange(tag, node.parentNode);                              // 648
};                                                                               // 649
                                                                                 // 650
var enclosingRangeSearch = function(tag, end, endIndex) {                        // 651
  // Search for an enclosing range, at the same level,                           // 652
  // starting at node `end` or after the range whose                             // 653
  // position in the end array of `end` is `endIndex`.                           // 654
  // The search works by scanning forwards for range ends                        // 655
  // while skipping over ranges whose starts we encounter.                       // 656
                                                                                 // 657
  if (typeof endIndex === "undefined")                                           // 658
    endIndex = -1;                                                               // 659
                                                                                 // 660
  if (end[tag] && endIndex + 1 < end[tag][1].length) {                           // 661
    // immediately enclosing range ends at same node as this one                 // 662
    return end[tag][1][endIndex + 1];                                            // 663
  }                                                                              // 664
                                                                                 // 665
  var node = end.nextSibling;                                                    // 666
  while (node) {                                                                 // 667
    var endIndex = 0;                                                            // 668
    var startData = node[tag] && node[tag][0];                                   // 669
    if (startData && startData.length) {                                         // 670
      // skip over sibling of this range                                         // 671
      var r = startData[0];                                                      // 672
      node = r._end;                                                             // 673
      endIndex = r._endIndex + 1;                                                // 674
    }                                                                            // 675
    if (node[tag] && endIndex < node[tag][1].length)                             // 676
      return node[tag][1][endIndex];                                             // 677
    node = node.nextSibling;                                                     // 678
  }                                                                              // 679
                                                                                 // 680
  return null;                                                                   // 681
};                                                                               // 682
                                                                                 // 683
///////////////////////////////////////////////////////////////////////////////////

}).call(this);
