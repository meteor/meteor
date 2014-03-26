(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                 //
// packages/spark/spark.js                                                                         //
//                                                                                                 //
/////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                   //
// XXX adjust Spark API so that the modules (eg, list, events) could                               // 1
// have been written by third parties on top of the public API?                                    // 2
                                                                                                   // 3
// XXX rename isolate to reflect that it is the only root of                                       // 4
// deps-based reactivity ('track'? 'compute'? 'sync'?)                                             // 5
                                                                                                   // 6
// XXX specify flush order someday (context dependencies? is this in                               // 7
// the domain of spark -- overdraw concerns?)                                                      // 8
                                                                                                   // 9
// XXX if not on IE6-8, don't do the extra work (traversals for event                              // 10
// setup) those browsers require                                                                   // 11
                                                                                                   // 12
// XXX flag errors if you have two landmarks with the same branch                                  // 13
// path, or if you have multiple preserve nodes in a landmark with the                             // 14
// same selector and label                                                                         // 15
                                                                                                   // 16
// XXX should functions with an htmlFunc use try/finally inside?                                   // 17
                                                                                                   // 18
// XXX test that non-Spark.render case works for each function (eg,                                // 19
// list() returns the expected HTML, Spark.createLandmark creates and                              // 20
// then destroys a landmark -- may already be tested?)                                             // 21
                                                                                                   // 22
// XXX in landmark-demo, if Template.timer.created throws an exception,                            // 23
// then it is never called again, even if you push the 'create a                                   // 24
// timer' button again. the problem is almost certainly in afterFlush                              // 25
// (not hard to see what it is.)                                                                   // 26
                                                                                                   // 27
Spark = {};                                                                                        // 28
SparkTest = {};                                                                                    // 29
                                                                                                   // 30
var currentRenderer = (function () {                                                               // 31
  var current = null;                                                                              // 32
  return {                                                                                         // 33
    get: function () {                                                                             // 34
      return current;                                                                              // 35
    },                                                                                             // 36
    withValue: function (v, func) {                                                                // 37
      var previous = current;                                                                      // 38
      current = v;                                                                                 // 39
      try { return func(); }                                                                       // 40
      finally { current = previous; }                                                              // 41
    }                                                                                              // 42
  };                                                                                               // 43
})();                                                                                              // 44
                                                                                                   // 45
TAG = "_spark_" + Random.id();                                                                     // 46
SparkTest.TAG = TAG;                                                                               // 47
                                                                                                   // 48
// We also export this as Spark._TAG due to a historical accident. I                               // 49
// don't know if anything uses it (possibly some of Chris Mather's                                 // 50
// stuff?)  but let's keep exporting it since without it it would be                               // 51
// very difficult for code outside the spark package to, eg, walk                                  // 52
// spark's liverange hierarchy.                                                                    // 53
Spark._TAG = TAG;                                                                                  // 54
                                                                                                   // 55
// XXX document contract for each type of annotation?                                              // 56
var ANNOTATION_NOTIFY = "notify";                                                                  // 57
var ANNOTATION_DATA = "data";                                                                      // 58
var ANNOTATION_ISOLATE = "isolate";                                                                // 59
var ANNOTATION_EVENTS = "events";                                                                  // 60
var ANNOTATION_WATCH = "watch";                                                                    // 61
var ANNOTATION_LABEL = "label";                                                                    // 62
var ANNOTATION_LANDMARK = "landmark";                                                              // 63
var ANNOTATION_LIST = "list";                                                                      // 64
var ANNOTATION_LIST_ITEM = "item";                                                                 // 65
// XXX why do we need, eg, _ANNOTATION_ISOLATE? it has no semantics?                               // 66
                                                                                                   // 67
// Use from tests to turn on extra UniversalEventListener sanity checks                            // 68
var checkIECompliance = false;                                                                     // 69
SparkTest.setCheckIECompliance = function (value) {                                                // 70
  checkIECompliance = value;                                                                       // 71
};                                                                                                 // 72
                                                                                                   // 73
// Private interface to 'preserve-inputs' package                                                  // 74
var globalPreserves = {};                                                                          // 75
Spark._addGlobalPreserve = function (selector, value) {                                            // 76
  globalPreserves[selector] = value;                                                               // 77
};                                                                                                 // 78
                                                                                                   // 79
                                                                                                   // 80
var makeRange = function (type, start, end, inner) {                                               // 81
  var range = new LiveRange(TAG, start, end, inner);                                               // 82
  range.type = type;                                                                               // 83
  return range;                                                                                    // 84
};                                                                                                 // 85
                                                                                                   // 86
var findRangeOfType = function (type, node) {                                                      // 87
  var range = LiveRange.findRange(TAG, node);                                                      // 88
  while (range && range.type !== type)                                                             // 89
    range = range.findParent();                                                                    // 90
                                                                                                   // 91
  return range;                                                                                    // 92
};                                                                                                 // 93
                                                                                                   // 94
var findParentOfType = function (type, range) {                                                    // 95
  do {                                                                                             // 96
    range = range.findParent();                                                                    // 97
  } while (range && range.type !== type);                                                          // 98
                                                                                                   // 99
  return range;                                                                                    // 100
};                                                                                                 // 101
                                                                                                   // 102
var notifyWatchers = function (start, end) {                                                       // 103
  var tempRange = new LiveRange(TAG, start, end, true /* innermost */);                            // 104
  for (var walk = tempRange; walk; walk = walk.findParent())                                       // 105
    if (walk.type === ANNOTATION_WATCH)                                                            // 106
      walk.notify();                                                                               // 107
  tempRange.destroy();                                                                             // 108
};                                                                                                 // 109
                                                                                                   // 110
var eventGuardActive = false;                                                                      // 111
// Spark does DOM manipulation inside an event guard to prevent events                             // 112
// like "blur" from firing.  It would be nice to deliver these events                              // 113
// in some cases, but running fresh event handling code on an invalid                              // 114
// LiveRange tree can easily produce errors.                                                       // 115
// This guard was motivated by seeing errors in Todos when switching                               // 116
// windows while an input field is focused.                                                        // 117
var withEventGuard = function (func) {                                                             // 118
  var previous = eventGuardActive;                                                                 // 119
  eventGuardActive = true;                                                                         // 120
  try { return func(); }                                                                           // 121
  finally { eventGuardActive = previous; }                                                         // 122
};                                                                                                 // 123
                                                                                                   // 124
Renderer = function () {                                                                           // 125
  // Map from annotation ID to an annotation function, which is called                             // 126
  // at render time and receives (startNode, endNode).                                             // 127
  this.annotations = {};                                                                           // 128
                                                                                                   // 129
  // Map from branch path to "notes" object, organized as a tree.                                  // 130
  // Each node in the tree has child pointers named ('_'+label).                                   // 131
  // Properties that don't start with '_' are arbitrary notes.                                     // 132
  // For example, the "happiness" of the branch path consisting                                    // 133
  // of labels "foo" and then "bar" would be                                                       // 134
  // `this._branchNotes._foo._bar.happiness`.                                                      // 135
  // Access to these notes is provided by LabelStack objects, of                                   // 136
  // which `this.currentBranch` is one.                                                            // 137
  this._branchNotes = {};                                                                          // 138
                                                                                                   // 139
  // The label stack representing the current branch path we                                       // 140
  // are in (based on calls to `Spark.labelBranch(label, htmlFunc)`).                              // 141
  this.currentBranch = this.newLabelStack();                                                       // 142
                                                                                                   // 143
  // All landmark ranges created during this rendering.                                            // 144
  this.landmarkRanges = [];                                                                        // 145
                                                                                                   // 146
  // Assembles the preservation information for patching.                                          // 147
  this.pc = new PreservationController;                                                            // 148
};                                                                                                 // 149
                                                                                                   // 150
_.extend(Renderer.prototype, {                                                                     // 151
  // `what` can be a function that takes a LiveRange, or just a set of                             // 152
  // attributes to add to the liverange.  type and what are optional.                              // 153
  // if no type is passed, no liverange will be created.                                           // 154
  // If what is a function, it will be called no matter what, even                                 // 155
  // if the annotated HTML was not used and no LiveRange was created,                              // 156
  // in which case it gets null as an argument.                                                    // 157
  annotate: function (html, type, what) {                                                          // 158
    if (typeof what !== 'function') {                                                              // 159
      var attribs = what;                                                                          // 160
      what = function (range) {                                                                    // 161
        if (range)                                                                                 // 162
          _.extend(range, attribs);                                                                // 163
      };                                                                                           // 164
    }                                                                                              // 165
    // The annotation tags that we insert into HTML strings must be                                // 166
    // unguessable in order to not create potential cross-site scripting                           // 167
    // attack vectors, so we use random strings.  Even a well-written app                          // 168
    // that avoids XSS vulnerabilities might, for example, put                                     // 169
    // unescaped < and > in HTML attribute values, where they are normally                         // 170
    // safe.  We can't assume that a string like '<1>' came from us                                // 171
    // and not arbitrary user-entered data.                                                        // 172
    var id = (type || '') + ":" + Random.id();                                                     // 173
    this.annotations[id] = function (start, end) {                                                 // 174
      if ((! start) || (! type)) {                                                                 // 175
        // ! start: materialize called us with no args because this                                // 176
        // annotation wasn't used                                                                  // 177
        // ! type: no type given, don't generate a LiveRange                                       // 178
        what(null);                                                                                // 179
        return;                                                                                    // 180
      }                                                                                            // 181
      var range = makeRange(type, start, end);                                                     // 182
      what(range);                                                                                 // 183
    };                                                                                             // 184
                                                                                                   // 185
    return "<$" + id + ">" + html + "</$" + id + ">";                                              // 186
  },                                                                                               // 187
                                                                                                   // 188
  // A LabelStack is a mutable branch path that you can modify                                     // 189
  // by pushing or popping labels.  At any time, you can ask for                                   // 190
  // this Renderer's notes for the current branch path.                                            // 191
  // Renderer's `currentBranch` field is a LabelStack, but you                                     // 192
  // can create your own for the purpose of walking the branches                                   // 193
  // and accessing notes.                                                                          // 194
  newLabelStack: function () {                                                                     // 195
    var stack = [this._branchNotes];                                                               // 196
    return {                                                                                       // 197
      pushLabel: function (label) {                                                                // 198
        var top = stack[stack.length - 1];                                                         // 199
        var key = '_' + label;                                                                     // 200
        stack.push(top[key] = (top[key] || {}));                                                   // 201
      },                                                                                           // 202
      popLabel: function () {                                                                      // 203
        stack.pop();                                                                               // 204
      },                                                                                           // 205
      getNotes: function () {                                                                      // 206
        var top = stack[stack.length - 1];                                                         // 207
        return top;                                                                                // 208
      },                                                                                           // 209
      // Mark this branch with `getNotes()[prop] = true` and also                                  // 210
      // walk up the stack marking parent branches (until an                                       // 211
      // existing truthy value for `prop` is found).                                               // 212
      // This makes it easy to test whether any descendent of a                                    // 213
      // branch has the mark.                                                                      // 214
      mark: function (prop) {                                                                      // 215
        for (var i = stack.length - 1;                                                             // 216
             i >= 0 && ! stack[i][prop];                                                           // 217
             i--)                                                                                  // 218
          stack[i][prop] = true;                                                                   // 219
      }                                                                                            // 220
    };                                                                                             // 221
  },                                                                                               // 222
                                                                                                   // 223
  // Turn the `html` string into a fragment, applying the annotations                              // 224
  // from 'renderer' in the process.                                                               // 225
  materialize: function (htmlFunc) {                                                               // 226
    var self = this;                                                                               // 227
                                                                                                   // 228
    var html = currentRenderer.withValue(self, htmlFunc);                                          // 229
    html = self.annotate(html); // wrap with an anonymous annotation                               // 230
                                                                                                   // 231
    var fragById = {};                                                                             // 232
    var replaceInclusions = function (container) {                                                 // 233
      var n = container.firstChild;                                                                // 234
      while (n) {                                                                                  // 235
        var next = n.nextSibling;                                                                  // 236
        if (n.nodeType === 8) { // COMMENT                                                         // 237
          var frag = fragById[n.nodeValue];                                                        // 238
          if (frag === false) {                                                                    // 239
            // id already used!                                                                    // 240
            throw new Error("Spark HTML fragments may only be used once. " +                       // 241
                            "Second use in " +                                                     // 242
                            DomUtils.fragmentToHtml(container));                                   // 243
          } else if (frag) {                                                                       // 244
            fragById[n.nodeValue] = false; // mark as used                                         // 245
            DomUtils.wrapFragmentForContainer(frag, n.parentNode);                                 // 246
            n.parentNode.replaceChild(frag, n);                                                    // 247
          }                                                                                        // 248
        } else if (n.nodeType === 1) { // ELEMENT                                                  // 249
          replaceInclusions(n);                                                                    // 250
        }                                                                                          // 251
        n = next;                                                                                  // 252
      }                                                                                            // 253
    };                                                                                             // 254
                                                                                                   // 255
    var bufferStack = [[]];                                                                        // 256
    var idStack = [];                                                                              // 257
    var ret;                                                                                       // 258
                                                                                                   // 259
    var regex = /<(\/?)\$([^<>]+)>|<|[^<]+/g;                                                      // 260
    regex.lastIndex = 0;                                                                           // 261
    var parts;                                                                                     // 262
    while ((parts = regex.exec(html))) {                                                           // 263
      var isOpen = ! parts[1];                                                                     // 264
      var id = parts[2];                                                                           // 265
      var annotationFunc = self.annotations[id];                                                   // 266
      if (annotationFunc === false) {                                                              // 267
        throw new Error("Spark HTML fragments may be used only once. " +                           // 268
                        "Second use of: " +                                                        // 269
                        DomUtils.fragmentToHtml(fragById[id]));                                    // 270
      } else if (! annotationFunc) {                                                               // 271
        bufferStack[bufferStack.length - 1].push(parts[0]);                                        // 272
      } else if (isOpen) {                                                                         // 273
        idStack.push(id);                                                                          // 274
        bufferStack.push([]);                                                                      // 275
      } else {                                                                                     // 276
        var idOnStack = idStack.pop();                                                             // 277
        if (idOnStack !== id)                                                                      // 278
          throw new Error("Range mismatch: " + idOnStack + " / " + id);                            // 279
        var frag = DomUtils.htmlToFragment(bufferStack.pop().join(''));                            // 280
        replaceInclusions(frag);                                                                   // 281
        // empty frag becomes HTML comment <!--empty--> so we have start/end                       // 282
        // nodes to pass to the annotation function                                                // 283
        if (! frag.firstChild)                                                                     // 284
          frag.appendChild(document.createComment("empty"));                                       // 285
        annotationFunc(frag.firstChild, frag.lastChild);                                           // 286
        self.annotations[id] = false; // mark as used                                              // 287
        if (! idStack.length) {                                                                    // 288
          // we're done; we just rendered the contents of the top-level                            // 289
          // annotation that we wrapped around htmlFunc ourselves.                                 // 290
          // there may be unused fragments in fragById that include                                // 291
          // LiveRanges, but only if the user broke the rules by including                         // 292
          // an annotation somewhere besides element level, like inside                            // 293
          // an attribute (which is not allowed).                                                  // 294
          ret = frag;                                                                              // 295
          break;                                                                                   // 296
        }                                                                                          // 297
        fragById[id] = frag;                                                                       // 298
        bufferStack[bufferStack.length - 1].push('<!--' + id + '-->');                             // 299
      }                                                                                            // 300
    }                                                                                              // 301
                                                                                                   // 302
    scheduleOnscreenSetup(ret, self.landmarkRanges);                                               // 303
    self.landmarkRanges = [];                                                                      // 304
                                                                                                   // 305
    _.each(self.annotations, function(annotationFunc) {                                            // 306
      if (annotationFunc)                                                                          // 307
        // call annotation func with no arguments to mean "you weren't used"                       // 308
        annotationFunc();                                                                          // 309
    });                                                                                            // 310
    self.annotations = {};                                                                         // 311
                                                                                                   // 312
    // Save original versions of every 'value' property. We want elements that                     // 313
    // have a value *attribute*, as well as form elements that have a value                        // 314
    // property but no value attribute (textarea and select).                                      // 315
    //                                                                                             // 316
    // We save it in a one-element array expando. We use the array because IE8                     // 317
    // gets confused by expando properties with scalar values and exposes them                     // 318
    // as HTML attributes.                                                                         // 319
    //                                                                                             // 320
    // We also save the values of CHECKED for radio and checkboxes.                                // 321
    _.each(DomUtils.findAll(ret, '[value], textarea, select'), function (node) {                   // 322
      node._sparkOriginalRenderedValue = [DomUtils.getElementValue(node)];                         // 323
    });                                                                                            // 324
    _.each(DomUtils.findAll(ret, 'input[type=checkbox], input[type=radio]'),                       // 325
           function (node) {                                                                       // 326
      node._sparkOriginalRenderedChecked = [!!node.checked];                                       // 327
    });                                                                                            // 328
                                                                                                   // 329
    return ret;                                                                                    // 330
  }                                                                                                // 331
                                                                                                   // 332
});                                                                                                // 333
                                                                                                   // 334
// Decorator for Spark annotations that take `html` and are                                        // 335
// pass-through without a renderer.  With this decorator,                                          // 336
// the annotation routine gets the current renderer, and                                           // 337
// if there isn't one returns `html` (the last argument).                                          // 338
var withRenderer = function (f) {                                                                  // 339
  return function (/* arguments */) {                                                              // 340
    var renderer = currentRenderer.get();                                                          // 341
    var args = _.toArray(arguments);                                                               // 342
    if (!renderer)                                                                                 // 343
      return args.pop();                                                                           // 344
    args.push(renderer);                                                                           // 345
    return f.apply(null, args);                                                                    // 346
  };                                                                                               // 347
};                                                                                                 // 348
                                                                                                   // 349
/******************************************************************************/                   // 350
/* Render and finalize                                                        */                   // 351
/******************************************************************************/                   // 352
                                                                                                   // 353
// Schedule setup tasks to run at the next flush, which is when the                                // 354
// newly rendered fragment must be on the screen (if it doesn't want                               // 355
// to get garbage-collected.)                                                                      // 356
//                                                                                                 // 357
// 'landmarkRanges' is a list of the landmark ranges in 'frag'. It may be                          // 358
// omitted if frag doesn't contain any landmarks.                                                  // 359
//                                                                                                 // 360
// XXX expose in the public API, eg as Spark.introduce(), so the user                              // 361
// can call it when manually inserting nodes? (via, eg, jQuery?) -- of                             // 362
// course in that case 'landmarkRanges' would be empty.                                            // 363
var scheduleOnscreenSetup = function (frag, landmarkRanges) {                                      // 364
  var renderedRange = new LiveRange(TAG, frag);                                                    // 365
  var finalized = false;                                                                           // 366
  renderedRange.finalize = function () {                                                           // 367
    finalized = true;                                                                              // 368
  };                                                                                               // 369
                                                                                                   // 370
  Deps.afterFlush(function () {                                                                    // 371
    if (finalized)                                                                                 // 372
      return;                                                                                      // 373
                                                                                                   // 374
    if (!DomUtils.isInDocument(renderedRange.firstNode())) {                                       // 375
      // We've detected that some nodes were taken off the screen                                  // 376
      // without calling Spark.finalize(). This could be because the                               // 377
      // user rendered them, but didn't insert them in the document                                // 378
      // before the next flush(). Or it could be because they used to                              // 379
      // be onscreen, but they were manually taken offscreen (eg, with                             // 380
      // jQuery) and the user neglected to call finalize() on the                                  // 381
      // removed nodes. Help the user out by finalizing the entire                                 // 382
      // subtree that is offscreen.                                                                // 383
      var node = renderedRange.firstNode();                                                        // 384
      while (node.parentNode)                                                                      // 385
        node = node.parentNode;                                                                    // 386
      if (node["_protect"]) {                                                                      // 387
        // test code can use this property to mark a root-level node                               // 388
        // (such as a DocumentFragment) as immune from                                             // 389
        // autofinalization. effectively, the DocumentFragment is                                  // 390
        // considered to be a first-class peer of `document`.                                      // 391
      } else {                                                                                     // 392
        Spark.finalize(node);                                                                      // 393
        return;                                                                                    // 394
      }                                                                                            // 395
    }                                                                                              // 396
                                                                                                   // 397
    // Deliver render callbacks to all landmarks that are now                                      // 398
    // onscreen (possibly not for the first time.)                                                 // 399
    _.each(landmarkRanges, function (landmarkRange) {                                              // 400
      if (! landmarkRange.isPreservedConstant)                                                     // 401
        landmarkRange.rendered.call(landmarkRange.landmark);                                       // 402
    });                                                                                            // 403
                                                                                                   // 404
    // Deliver render callbacks to all landmarks that enclose the                                  // 405
    // updated region.                                                                             // 406
    //                                                                                             // 407
    // XXX unify with notifyWatchers. maybe remove _ANNOTATION_WATCH                               // 408
    // and just give everyone a contentsModified callback (sibling to                              // 409
    // 'finalize')                                                                                 // 410
    //                                                                                             // 411
    // future: include an argument in the callback to distinguish this                             // 412
    // case from the previous                                                                      // 413
    var walk = renderedRange;                                                                      // 414
    while ((walk = findParentOfType(ANNOTATION_LANDMARK, walk)))                                   // 415
      walk.rendered.call(walk.landmark);                                                           // 416
                                                                                                   // 417
    // This code can run several times on the same nodes (if the                                   // 418
    // output of a render is included in a render), so it must be                                  // 419
    // idempotent. This is not the best, asymptotically. There are                                 // 420
    // things we could do to improve it.                                                           // 421
    notifyWatchers(renderedRange.firstNode(), renderedRange.lastNode());                           // 422
    renderedRange.destroy();                                                                       // 423
  });                                                                                              // 424
};                                                                                                 // 425
                                                                                                   // 426
Spark.render = function (htmlFunc) {                                                               // 427
  var renderer = new Renderer;                                                                     // 428
  var frag = renderer.materialize(htmlFunc);                                                       // 429
  return frag;                                                                                     // 430
};                                                                                                 // 431
                                                                                                   // 432
                                                                                                   // 433
// Find all of all nodes and regions that should be preserved in                                   // 434
// patching. Return a list of objects. There are two kinds of objects                              // 435
// in the list:                                                                                    // 436
//                                                                                                 // 437
// A preserved node:                                                                               // 438
//   {type: "node", from: Node, to: Node}                                                          // 439
//                                                                                                 // 440
// A preserved (constant) region:                                                                  // 441
//   {type: "region", fromStart: Node, fromEnd: Node,                                              // 442
//      newRange: LiveRange}                                                                       // 443
//                                                                                                 // 444
// `existingRange` is the range in the document whose contents are to                              // 445
// be replaced. `newRange` holds the new contents and is not part of                               // 446
// the document DOM tree.  The implementation will temporarily reparent                            // 447
// the nodes in `newRange` into the document to check for selector matches.                        // 448
var PreservationController = function () {                                                         // 449
  this.roots = []; // keys 'landmarkRange', 'fromRange', 'toRange'                                 // 450
  this.regionPreservations = [];                                                                   // 451
};                                                                                                 // 452
                                                                                                   // 453
_.extend(PreservationController.prototype, {                                                       // 454
  // Specify preservations that should be in effect on a fromRange/toRange                         // 455
  // pair.  If specified, `optContextNode` should be an ancestor node of                           // 456
  // fromRange that selectors are to be considered relative to.                                    // 457
  addRoot: function (preserve, fromRange, toRange, optContextNode) {                               // 458
    var self = this;                                                                               // 459
    self.roots.push({ context: optContextNode, preserve: preserve,                                 // 460
                      fromRange: fromRange, toRange: toRange});                                    // 461
  },                                                                                               // 462
                                                                                                   // 463
  addConstantRegion: function (from, to) {                                                         // 464
    var self = this;                                                                               // 465
    self.regionPreservations.push({                                                                // 466
      type: "region",                                                                              // 467
      fromStart: from.firstNode(), fromEnd: from.lastNode(),                                       // 468
      newRange: to                                                                                 // 469
    });                                                                                            // 470
  },                                                                                               // 471
                                                                                                   // 472
  computePreservations: function (existingRange, newRange) {                                       // 473
    var self = this;                                                                               // 474
    var preservations = _.clone(self.regionPreservations);                                         // 475
                                                                                                   // 476
    var visitLabeledNodes = function (context, clipRange, nodeLabeler, selector, func) {           // 477
      context = (context || clipRange.containerNode());                                            // 478
      var nodes = DomUtils.findAllClipped(                                                         // 479
        context, selector, clipRange.firstNode(), clipRange.lastNode());                           // 480
                                                                                                   // 481
      _.each(nodes, function (n) {                                                                 // 482
        var label = nodeLabeler(n);                                                                // 483
        label && func(n, label);                                                                   // 484
      });                                                                                          // 485
    };                                                                                             // 486
                                                                                                   // 487
    // Find the old incarnation of each of the preserved nodes                                     // 488
    _.each(self.roots, function (root) {                                                           // 489
      root.fromNodesByLabel = {};                                                                  // 490
      _.each(root.preserve, function (nodeLabeler, selector) {                                     // 491
        root.fromNodesByLabel[selector] = {};                                                      // 492
        visitLabeledNodes(                                                                         // 493
          root.context, root.fromRange, nodeLabeler, selector,                                     // 494
          function (n, label) {                                                                    // 495
            root.fromNodesByLabel[selector][label] = n;                                            // 496
          });                                                                                      // 497
      });                                                                                          // 498
    });                                                                                            // 499
                                                                                                   // 500
    // Temporarily put newRange into the document so that we can do                                // 501
    // properly contextualized selector queries against it.                                        // 502
    //                                                                                             // 503
    // Create a temporary range around newRange, and also around any enclosing                     // 504
    // ranges that happen to also start and end on those nodes.  It is ok                          // 505
    // to temporarily put these in the document as well, because CSS selectors                     // 506
    // don't care and we will put them back.  `tempRange` will hold our place                      // 507
    // in the tree `newRange` came from.                                                           // 508
    var tempRange = new LiveRange(TAG, newRange.firstNode(), newRange.lastNode());                 // 509
    var commentFrag = document.createDocumentFragment();                                           // 510
    commentFrag.appendChild(document.createComment(""));                                           // 511
    var newRangeFrag = tempRange.replaceContents(commentFrag);                                     // 512
    // `wrapperRange` will mark where we inserted newRange into the document.                      // 513
    var wrapperRange = new LiveRange(TAG, newRangeFrag);                                           // 514
    existingRange.insertBefore(newRangeFrag);                                                      // 515
                                                                                                   // 516
    _.each(self.roots, function (root) {                                                           // 517
      _.each(root.preserve, function (nodeLabeler, selector) {                                     // 518
        visitLabeledNodes(root.context, root.toRange, nodeLabeler, selector, function (n, label) { // 519
          var match = root.fromNodesByLabel[selector][label];                                      // 520
          if (match) {                                                                             // 521
            preservations.push({ type: "node", from: match, to: n });                              // 522
            root.fromNodesByLabel[selector][label] = null;                                         // 523
          }                                                                                        // 524
        });                                                                                        // 525
      });                                                                                          // 526
    });                                                                                            // 527
                                                                                                   // 528
    // Extraction is legal because we're just taking the document                                  // 529
    // back to the state it was in before insertBefore.                                            // 530
    var extractedFrag = wrapperRange.extract();                                                    // 531
    wrapperRange.destroy();                                                                        // 532
    tempRange.replaceContents(extractedFrag);                                                      // 533
    tempRange.destroy();                                                                           // 534
                                                                                                   // 535
    return preservations;                                                                          // 536
  }                                                                                                // 537
});                                                                                                // 538
                                                                                                   // 539
                                                                                                   // 540
// XXX debugging                                                                                   // 541
var pathForRange = function (r) {                                                                  // 542
  var path = [], r;                                                                                // 543
  while ((r = findParentOfType(ANNOTATION_LABEL, r)))                                              // 544
    path.unshift(r.label);                                                                         // 545
  return path.join(' :: ');                                                                        // 546
};                                                                                                 // 547
                                                                                                   // 548
// `range` is a region of `document`. Modify it in-place so that it                                // 549
// matches the result of Spark.render(htmlFunc), preserving landmarks.                             // 550
//                                                                                                 // 551
Spark.renderToRange = function (range, htmlFunc) {                                                 // 552
  // `range` may be out-of-document and we don't check here.                                       // 553
  // XXX should we?                                                                                // 554
  //                                                                                               // 555
  // Explicit finalization of ranges (done within Spark or by a call to                            // 556
  // Spark.finalize) prevents us from being called in the first place.                             // 557
  // The newly rendered material will be checked to see if it's in the                             // 558
  // document by scheduleOnscreenSetUp's scheduled setup.                                          // 559
  // However, if range is not valid, bail out now before running                                   // 560
  // htmlFunc.                                                                                     // 561
  var startNode = range.firstNode();                                                               // 562
  if (! startNode || ! startNode.parentNode)                                                       // 563
    return;                                                                                        // 564
                                                                                                   // 565
  var renderer = new Renderer();                                                                   // 566
                                                                                                   // 567
  // Call 'func' for each landmark in 'range'. Pass two arguments to                               // 568
  // 'func', the range, and an extra "notes" object such that two                                  // 569
  // landmarks receive the same (===) notes object iff they have the                               // 570
  // same branch path. 'func' can write to the notes object so long as                             // 571
  // it limits itself to attributes that do not start with '_'.                                    // 572
  var visitLandmarksInRange = function (range, func) {                                             // 573
    var stack = renderer.newLabelStack();                                                          // 574
                                                                                                   // 575
    range.visit(function (isStart, r) {                                                            // 576
      if (r.type === ANNOTATION_LABEL) {                                                           // 577
        if (isStart)                                                                               // 578
          stack.pushLabel(r.label);                                                                // 579
        else                                                                                       // 580
          stack.popLabel();                                                                        // 581
      } else if (r.type === ANNOTATION_LANDMARK && isStart) {                                      // 582
        func(r, stack.getNotes());                                                                 // 583
      }                                                                                            // 584
    });                                                                                            // 585
  };                                                                                               // 586
                                                                                                   // 587
  // Find all of the landmarks in the old contents of the range                                    // 588
  visitLandmarksInRange(range, function (landmarkRange, notes) {                                   // 589
    notes.originalRange = landmarkRange;                                                           // 590
  });                                                                                              // 591
                                                                                                   // 592
  // Once we render the new fragment, as soon as it is placed into the DOM (even                   // 593
  // temporarily), if any radio buttons in the new framgent are checked, any                       // 594
  // radio buttons with the same name in the entire document will be unchecked                     // 595
  // (since only one radio button of a given name can be checked at a time). So                    // 596
  // we save the current checked value of all radio buttons in an expando.                         // 597
  var radios = DomUtils.findAllClipped(                                                            // 598
    range.containerNode(), 'input[type=radio]',                                                    // 599
    range.firstNode(), range.lastNode());                                                          // 600
  _.each(radios, function (node) {                                                                 // 601
    node._currentChecked = [!!node.checked];                                                       // 602
  });                                                                                              // 603
                                                                                                   // 604
  var frag = renderer.materialize(htmlFunc);                                                       // 605
                                                                                                   // 606
  DomUtils.wrapFragmentForContainer(frag, range.containerNode());                                  // 607
                                                                                                   // 608
  var tempRange = new LiveRange(TAG, frag);                                                        // 609
                                                                                                   // 610
  // find preservation roots from matched landmarks inside the                                     // 611
  // rerendered region                                                                             // 612
  var pc = renderer.pc;                                                                            // 613
  visitLandmarksInRange(                                                                           // 614
    tempRange, function (landmarkRange, notes) {                                                   // 615
      if (notes.originalRange) {                                                                   // 616
        if (landmarkRange.constant)                                                                // 617
          pc.addConstantRegion(notes.originalRange, landmarkRange);                                // 618
                                                                                                   // 619
        pc.addRoot(landmarkRange.preserve,                                                         // 620
                   notes.originalRange, landmarkRange);                                            // 621
      }                                                                                            // 622
    });                                                                                            // 623
                                                                                                   // 624
  // find preservation roots that come from landmarks enclosing the                                // 625
  // updated region                                                                                // 626
  var walk = range;                                                                                // 627
  while ((walk = walk.findParent())) {                                                             // 628
    if (! walk.firstNode().parentNode)                                                             // 629
      // we're in a DOM island with a top-level range (not really                                  // 630
      // allowed, but could happen if `range` is on nodes that                                     // 631
      // manually removed.                                                                         // 632
      // XXX check for this sooner; hard to reason about this function                             // 633
      // on a "malformed" liverange tree                                                           // 634
      break;                                                                                       // 635
                                                                                                   // 636
    if (walk.type === ANNOTATION_LANDMARK, walk)                                                   // 637
      pc.addRoot(walk.preserve, range, tempRange, walk.containerNode());                           // 638
  }                                                                                                // 639
                                                                                                   // 640
  pc.addRoot(globalPreserves, range, tempRange);                                                   // 641
                                                                                                   // 642
  // compute preservations (must do this before destroying tempRange)                              // 643
  var preservations = pc.computePreservations(range, tempRange);                                   // 644
                                                                                                   // 645
  tempRange.destroy();                                                                             // 646
                                                                                                   // 647
  var results = {};                                                                                // 648
                                                                                                   // 649
  // Patch! (using preservations)                                                                  // 650
  withEventGuard(function () {                                                                     // 651
    range.operate(function (start, end) {                                                          // 652
      // XXX this will destroy all liveranges, including ones                                      // 653
      // inside constant regions whose DOM nodes we are going                                      // 654
      // to preserve untouched                                                                     // 655
      Spark.finalize(start, end);                                                                  // 656
      patch(start.parentNode, frag, start.previousSibling,                                         // 657
            end.nextSibling, preservations, results);                                              // 658
    });                                                                                            // 659
  });                                                                                              // 660
                                                                                                   // 661
  _.each(results.regionPreservations, function (landmarkRange) {                                   // 662
    // Rely on the fact that computePreservations only emits                                       // 663
    // region preservations whose ranges are landmarks.                                            // 664
    // This flag means that landmarkRange is a new constant landmark                               // 665
    // range that matched an old one *and* was DOM-preservable by                                  // 666
    // the patcher.                                                                                // 667
    landmarkRange.isPreservedConstant = true;                                                      // 668
  });                                                                                              // 669
};                                                                                                 // 670
                                                                                                   // 671
// Delete all of the liveranges in the range of nodes between `start`                              // 672
// and `end`, and call their 'finalize' function if any. Or instead of                             // 673
// `start` and `end` you may pass a fragment in `start`.                                           // 674
//                                                                                                 // 675
Spark.finalize = function (start, end) {                                                           // 676
  if (! start.parentNode && start.nodeType !== 11 /* DocumentFragment */) {                        // 677
    // Workaround for LiveRanges' current inability to contain                                     // 678
    // a node with no parentNode.                                                                  // 679
    var frag = document.createDocumentFragment();                                                  // 680
    frag.appendChild(start);                                                                       // 681
    start = frag;                                                                                  // 682
    end = null;                                                                                    // 683
  }                                                                                                // 684
  var wrapper = new LiveRange(TAG, start, end);                                                    // 685
  wrapper.visit(function (isStart, range) {                                                        // 686
    isStart && range.finalize && range.finalize();                                                 // 687
  });                                                                                              // 688
  wrapper.destroy(true /* recursive */);                                                           // 689
};                                                                                                 // 690
                                                                                                   // 691
/******************************************************************************/                   // 692
/* Data contexts                                                              */                   // 693
/******************************************************************************/                   // 694
                                                                                                   // 695
Spark.setDataContext = withRenderer(function (dataContext, html, _renderer) {                      // 696
  return _renderer.annotate(                                                                       // 697
    html, ANNOTATION_DATA, { data: dataContext });                                                 // 698
});                                                                                                // 699
                                                                                                   // 700
Spark.getDataContext = function (node) {                                                           // 701
  var range = findRangeOfType(ANNOTATION_DATA, node);                                              // 702
  return range && range.data;                                                                      // 703
};                                                                                                 // 704
                                                                                                   // 705
/******************************************************************************/                   // 706
/* Events                                                                     */                   // 707
/******************************************************************************/                   // 708
                                                                                                   // 709
var universalListener = null;                                                                      // 710
var getListener = function () {                                                                    // 711
  if (!universalListener)                                                                          // 712
    universalListener = new UniversalEventListener(function (event) {                              // 713
      // Handle a currently-propagating event on a particular node.                                // 714
      // We walk each enclosing liverange of the node and offer it the                             // 715
      // chance to handle the event. It's range.handler's                                          // 716
      // responsibility to check isImmediatePropagationStopped()                                   // 717
      // before delivering events to the user. We precompute the list                              // 718
      // of enclosing liveranges to defend against the case where user                             // 719
      // event handlers change the DOM.                                                            // 720
                                                                                                   // 721
      if (eventGuardActive)                                                                        // 722
        // swallow the event                                                                       // 723
        return;                                                                                    // 724
                                                                                                   // 725
      var ranges = [];                                                                             // 726
      var walk = findRangeOfType(ANNOTATION_EVENTS,                                                // 727
                                 event.currentTarget);                                             // 728
      while (walk) {                                                                               // 729
        ranges.push(walk);                                                                         // 730
        walk = findParentOfType(ANNOTATION_EVENTS, walk);                                          // 731
      }                                                                                            // 732
      _.each(ranges, function (r) {                                                                // 733
        r.handler(event);                                                                          // 734
      });                                                                                          // 735
    }, checkIECompliance);                                                                         // 736
                                                                                                   // 737
  return universalListener;                                                                        // 738
};                                                                                                 // 739
                                                                                                   // 740
Spark.attachEvents = withRenderer(function (eventMap, html, _renderer) {                           // 741
  var listener = getListener();                                                                    // 742
                                                                                                   // 743
  var handlerMap = {}; // type -> [{selector, callback}, ...]                                      // 744
  // iterate over eventMap, which has form {"type selector, ...": callbacks},                      // 745
  // callbacks can either be a fn, or an array of fns                                              // 746
  // and populate handlerMap                                                                       // 747
  _.each(eventMap, function(callbacks, spec) {                                                     // 748
    if ('function' === typeof callbacks) {                                                         // 749
      callbacks = [ callbacks ];                                                                   // 750
    }                                                                                              // 751
    var clauses = spec.split(/,\s+/);                                                              // 752
    // iterate over clauses of spec, e.g. ['click .foo', 'click .bar']                             // 753
    _.each(clauses, function (clause) {                                                            // 754
      var parts = clause.split(/\s+/);                                                             // 755
      if (parts.length === 0)                                                                      // 756
        return;                                                                                    // 757
                                                                                                   // 758
      var type = parts.shift();                                                                    // 759
      var selector = parts.join(' ');                                                              // 760
                                                                                                   // 761
      handlerMap[type] = handlerMap[type] || [];                                                   // 762
      _.each(callbacks, function(callback) {                                                       // 763
        handlerMap[type].push({selector: selector, callback: callback});                           // 764
      });                                                                                          // 765
    });                                                                                            // 766
  });                                                                                              // 767
                                                                                                   // 768
  var eventTypes = _.keys(handlerMap);                                                             // 769
                                                                                                   // 770
  var installHandlers = function (range) {                                                         // 771
    _.each(eventTypes, function (t) {                                                              // 772
      for(var n = range.firstNode(),                                                               // 773
              after = range.lastNode().nextSibling;                                                // 774
          n && n !== after;                                                                        // 775
          n = n.nextSibling)                                                                       // 776
        listener.installHandler(n, t);                                                             // 777
    });                                                                                            // 778
  };                                                                                               // 779
                                                                                                   // 780
  html = _renderer.annotate(                                                                       // 781
    html, ANNOTATION_WATCH, {                                                                      // 782
      notify: function () {                                                                        // 783
        installHandlers(this);                                                                     // 784
      }                                                                                            // 785
    });                                                                                            // 786
                                                                                                   // 787
  var finalized = false;                                                                           // 788
                                                                                                   // 789
  html = _renderer.annotate(                                                                       // 790
    html, ANNOTATION_EVENTS, function (range) {                                                    // 791
      if (! range)                                                                                 // 792
        return;                                                                                    // 793
                                                                                                   // 794
      _.each(eventTypes, function (t) {                                                            // 795
        listener.addType(t);                                                                       // 796
      });                                                                                          // 797
      installHandlers(range);                                                                      // 798
                                                                                                   // 799
      range.finalize = function () {                                                               // 800
        finalized = true;                                                                          // 801
      };                                                                                           // 802
                                                                                                   // 803
      range.handler = function (event) {                                                           // 804
        var handlers = handlerMap[event.type] || [];                                               // 805
                                                                                                   // 806
        for (var i = 0; i < handlers.length; i++) {                                                // 807
          if (finalized || event.isImmediatePropagationStopped())                                  // 808
            return;                                                                                // 809
                                                                                                   // 810
          var handler = handlers[i];                                                               // 811
          var callback = handler.callback;                                                         // 812
          var selector = handler.selector;                                                         // 813
                                                                                                   // 814
          if (selector) {                                                                          // 815
            if (! DomUtils.matchesSelectorClipped(                                                 // 816
              event.currentTarget, range.containerNode(), selector,                                // 817
              range.firstNode(), range.lastNode())) {                                              // 818
              continue;                                                                            // 819
            }                                                                                      // 820
          } else {                                                                                 // 821
            // if no selector, only match the event target                                         // 822
            if (event.currentTarget !== event.target)                                              // 823
              continue;                                                                            // 824
          }                                                                                        // 825
                                                                                                   // 826
          // Found a matching handler. Call it.                                                    // 827
          var eventData = Spark.getDataContext(event.currentTarget) || {};                         // 828
          var landmarkRange =                                                                      // 829
                findParentOfType(ANNOTATION_LANDMARK, range);                                      // 830
          var landmark = (landmarkRange && landmarkRange.landmark);                                // 831
                                                                                                   // 832
          // Note that the handler can do arbitrary things, like call                              // 833
          // Deps.flush() or otherwise remove and finalize parts of                                // 834
          // the DOM.  We can't assume `range` is valid past this point,                           // 835
          // and we'll check the `finalized` flag at the top of the loop.                          // 836
          var returnValue = callback.call(eventData, event, landmark);                             // 837
                                                                                                   // 838
          // allow app to `return false` from event handler, just like                             // 839
          // you can in a jquery event handler                                                     // 840
          if (returnValue === false) {                                                             // 841
            event.stopImmediatePropagation();                                                      // 842
            event.preventDefault();                                                                // 843
          }                                                                                        // 844
        }                                                                                          // 845
      };                                                                                           // 846
    });                                                                                            // 847
                                                                                                   // 848
  return html;                                                                                     // 849
});                                                                                                // 850
                                                                                                   // 851
/******************************************************************************/                   // 852
/* Isolate                                                                    */                   // 853
/******************************************************************************/                   // 854
                                                                                                   // 855
Spark.isolate = function (htmlFunc) {                                                              // 856
  var renderer = currentRenderer.get();                                                            // 857
  if (!renderer)                                                                                   // 858
    return htmlFunc();                                                                             // 859
                                                                                                   // 860
  var range;                                                                                       // 861
  var firstRun = true;                                                                             // 862
  var retHtml;                                                                                     // 863
  Deps.autorun(function (handle) {                                                                 // 864
    if (firstRun) {                                                                                // 865
      retHtml = renderer.annotate(                                                                 // 866
        htmlFunc(), ANNOTATION_ISOLATE,                                                            // 867
        function (r) {                                                                             // 868
          if (! r) {                                                                               // 869
            // annotation not used; kill this autorun                                              // 870
            handle.stop();                                                                         // 871
          } else {                                                                                 // 872
            range = r;                                                                             // 873
            range.finalize = function () {                                                         // 874
              // Spark.finalize() was called on our range (presumably                              // 875
              // because it was removed from the document.)  Kill                                  // 876
              // this autorun.                                                                     // 877
              handle.stop();                                                                       // 878
            };                                                                                     // 879
          }                                                                                        // 880
        });                                                                                        // 881
      firstRun = false;                                                                            // 882
    } else {                                                                                       // 883
      Spark.renderToRange(range, htmlFunc);                                                        // 884
    }                                                                                              // 885
  });                                                                                              // 886
                                                                                                   // 887
  return retHtml;                                                                                  // 888
};                                                                                                 // 889
                                                                                                   // 890
/******************************************************************************/                   // 891
/* Lists                                                                      */                   // 892
/******************************************************************************/                   // 893
                                                                                                   // 894
// XXX duplicated code from minimongo.js.  It's small though.                                      // 895
var applyChanges = function (doc, changeFields) {                                                  // 896
  _.each(changeFields, function (value, key) {                                                     // 897
    if (value === undefined)                                                                       // 898
      delete doc[key];                                                                             // 899
    else                                                                                           // 900
      doc[key] = value;                                                                            // 901
  });                                                                                              // 902
};                                                                                                 // 903
                                                                                                   // 904
                                                                                                   // 905
// If minimongo is available (it's a weak dependency) use its ID stringifier (so                   // 906
// that, eg, ObjectId and strings don't overlap). Otherwise just use the                           // 907
// identity function.                                                                              // 908
// This is also used in convenience.js.                                                            // 909
idStringify = Package.minimongo                                                                    // 910
  ? Package.minimongo.LocalCollection._idStringify                                                 // 911
  : function (id) { return id; };                                                                  // 912
                                                                                                   // 913
Spark.list = function (cursor, itemFunc, elseFunc) {                                               // 914
  elseFunc = elseFunc || function () { return ''; };                                               // 915
                                                                                                   // 916
  // Create a level of indirection around our cursor callbacks so we                               // 917
  // can change them later                                                                         // 918
  var callbacks = {};                                                                              // 919
  var observerCallbacks = {};                                                                      // 920
  _.each(["addedBefore", "removed", "movedBefore", "changed"], function (name) {                   // 921
    observerCallbacks[name] = function () {                                                        // 922
      return callbacks[name].apply(null, arguments);                                               // 923
    };                                                                                             // 924
  });                                                                                              // 925
                                                                                                   // 926
  // Get the current contents of the cursor.                                                       // 927
                                                                                                   // 928
  var itemDict = new OrderedDict(idStringify);                                                     // 929
  _.extend(callbacks, {                                                                            // 930
    addedBefore: function (id, item, before) {                                                     // 931
      var doc = EJSON.clone(item);                                                                 // 932
      doc._id = id;                                                                                // 933
      var elt = {doc: doc, liveRange: null};                                                       // 934
      itemDict.putBefore(id, elt, before);                                                         // 935
    }                                                                                              // 936
  });                                                                                              // 937
  var handle = cursor.observeChanges(observerCallbacks);                                           // 938
                                                                                                   // 939
  // Get the renderer, if any                                                                      // 940
  var renderer = currentRenderer.get();                                                            // 941
  var maybeAnnotate = renderer ?                                                                   // 942
        _.bind(renderer.annotate, renderer) :                                                      // 943
    function (html) { return html; };                                                              // 944
                                                                                                   // 945
  // Templates should have access to data and methods added by the                                 // 946
  // transformer, but observeChanges doesn't transform, so we have to do                           // 947
  // it here.                                                                                      // 948
  //                                                                                               // 949
  // NOTE: this is a little bit of an abstraction violation. Ideally,                              // 950
  // the only thing Spark should know about Minimongo is the contract of                           // 951
  // observeChanges. In theory, anything that implements observeChanges                            // 952
  // could be passed to Spark.list. But meh.                                                       // 953
  var transformedDoc = function (doc) {                                                            // 954
    if (cursor.getTransform && cursor.getTransform())                                              // 955
      return cursor.getTransform()(EJSON.clone(doc));                                              // 956
    return doc;                                                                                    // 957
  };                                                                                               // 958
                                                                                                   // 959
  // Render the initial contents. If we have a renderer, create a                                  // 960
  // range around each item as well as around the list, and save them                              // 961
  // off for later.                                                                                // 962
  var html = '';                                                                                   // 963
  var outerRange;                                                                                  // 964
  if (itemDict.empty())                                                                            // 965
    html = elseFunc();                                                                             // 966
  else {                                                                                           // 967
    itemDict.forEach(function (elt) {                                                              // 968
        html += maybeAnnotate(                                                                     // 969
          itemFunc(transformedDoc(elt.doc)),                                                       // 970
          ANNOTATION_LIST_ITEM,                                                                    // 971
          function (range) {                                                                       // 972
            elt.liveRange = range;                                                                 // 973
          });                                                                                      // 974
    });                                                                                            // 975
  }                                                                                                // 976
  var stopped = false;                                                                             // 977
  var cleanup = function () {                                                                      // 978
    handle.stop();                                                                                 // 979
    stopped = true;                                                                                // 980
  };                                                                                               // 981
  html = maybeAnnotate(html, ANNOTATION_LIST, function (range) {                                   // 982
    if (! range) {                                                                                 // 983
      // We never ended up on the screen (caller discarded our return                              // 984
      // value)                                                                                    // 985
      cleanup();                                                                                   // 986
    } else {                                                                                       // 987
      outerRange = range;                                                                          // 988
      outerRange.finalize = cleanup;                                                               // 989
    }                                                                                              // 990
  });                                                                                              // 991
                                                                                                   // 992
  // No renderer? Then we have no way to update the returned html and                              // 993
  // we can close the observer.                                                                    // 994
  if (! renderer)                                                                                  // 995
    cleanup();                                                                                     // 996
                                                                                                   // 997
  // Called by `removed` and `moved` in order to cause render callbacks on                         // 998
  // parent landmarks.                                                                             // 999
  // XXX This is not the final solution.  1) This code should be unified                           // 1000
  // with the code in scheduleOnscreenSetup.  2) In general, lists are                             // 1001
  // going to cause a lot of callbacks (one per collection callback).                              // 1002
  // Maybe that will make sense if we give render callbacks subrange info.                         // 1003
  var notifyParentsRendered = function () {                                                        // 1004
    var walk = outerRange;                                                                         // 1005
    while ((walk = findParentOfType(ANNOTATION_LANDMARK, walk)))                                   // 1006
      walk.rendered.call(walk.landmark);                                                           // 1007
  };                                                                                               // 1008
                                                                                                   // 1009
  var later = function (f) {                                                                       // 1010
    Deps.afterFlush(function () {                                                                  // 1011
      if (! stopped)                                                                               // 1012
        withEventGuard(f);                                                                         // 1013
    });                                                                                            // 1014
  };                                                                                               // 1015
                                                                                                   // 1016
  // The DOM update callbacks.                                                                     // 1017
  _.extend(callbacks, {                                                                            // 1018
    addedBefore: function (id, fields, before) {                                                   // 1019
      later(function () {                                                                          // 1020
        var doc = EJSON.clone(fields);                                                             // 1021
        doc._id = id;                                                                              // 1022
        var frag = Spark.render(_.bind(itemFunc, null, transformedDoc(doc)));                      // 1023
        DomUtils.wrapFragmentForContainer(frag, outerRange.containerNode());                       // 1024
        var range = makeRange(ANNOTATION_LIST_ITEM, frag);                                         // 1025
                                                                                                   // 1026
        if (itemDict.empty()) {                                                                    // 1027
          Spark.finalize(outerRange.replaceContents(frag));                                        // 1028
        } else if (before === null) {                                                              // 1029
          itemDict.lastValue().liveRange.insertAfter(frag);                                        // 1030
        } else {                                                                                   // 1031
          itemDict.get(before).liveRange.insertBefore(frag);                                       // 1032
        }                                                                                          // 1033
        itemDict.putBefore(id, {doc: doc, liveRange: range}, before);                              // 1034
      });                                                                                          // 1035
    },                                                                                             // 1036
                                                                                                   // 1037
    removed: function (id) {                                                                       // 1038
      later(function () {                                                                          // 1039
        if (itemDict.first() === itemDict.last()) {                                                // 1040
          var frag = Spark.render(elseFunc);                                                       // 1041
          DomUtils.wrapFragmentForContainer(frag, outerRange.containerNode());                     // 1042
          Spark.finalize(outerRange.replaceContents(frag));                                        // 1043
        } else                                                                                     // 1044
          Spark.finalize(itemDict.get(id).liveRange.extract());                                    // 1045
                                                                                                   // 1046
        itemDict.remove(id);                                                                       // 1047
                                                                                                   // 1048
        notifyParentsRendered();                                                                   // 1049
      });                                                                                          // 1050
    },                                                                                             // 1051
                                                                                                   // 1052
    movedBefore: function (id, before) {                                                           // 1053
      later(function () {                                                                          // 1054
        var frag = itemDict.get(id).liveRange.extract();                                           // 1055
        if (before === null) {                                                                     // 1056
          itemDict.lastValue().liveRange.insertAfter(frag);                                        // 1057
        } else {                                                                                   // 1058
          itemDict.get(before).liveRange.insertBefore(frag);                                       // 1059
        }                                                                                          // 1060
        itemDict.moveBefore(id, before);                                                           // 1061
        notifyParentsRendered();                                                                   // 1062
      });                                                                                          // 1063
    },                                                                                             // 1064
                                                                                                   // 1065
    changed: function (id, fields) {                                                               // 1066
      later(function () {                                                                          // 1067
        var elt = itemDict.get(id);                                                                // 1068
        if (!elt)                                                                                  // 1069
          throw new Error("Unknown id for changed: " + id);                                        // 1070
        applyChanges(elt.doc, fields);                                                             // 1071
        Spark.renderToRange(elt.liveRange,                                                         // 1072
                            _.bind(itemFunc, null, transformedDoc(elt.doc)));                      // 1073
      });                                                                                          // 1074
    }                                                                                              // 1075
  });                                                                                              // 1076
                                                                                                   // 1077
  return html;                                                                                     // 1078
};                                                                                                 // 1079
                                                                                                   // 1080
/******************************************************************************/                   // 1081
/* Labels and landmarks                                                       */                   // 1082
/******************************************************************************/                   // 1083
                                                                                                   // 1084
var nextLandmarkId = 1;                                                                            // 1085
                                                                                                   // 1086
Spark.Landmark = function () {                                                                     // 1087
  this.id = nextLandmarkId++;                                                                      // 1088
  this._range = null; // will be set when put onscreen                                             // 1089
};                                                                                                 // 1090
                                                                                                   // 1091
_.extend(Spark.Landmark.prototype, {                                                               // 1092
  firstNode: function () {                                                                         // 1093
    return this._range.firstNode();                                                                // 1094
  },                                                                                               // 1095
  lastNode: function () {                                                                          // 1096
    return this._range.lastNode();                                                                 // 1097
  },                                                                                               // 1098
  find: function (selector) {                                                                      // 1099
    var r = this._range;                                                                           // 1100
    return DomUtils.findClipped(r.containerNode(), selector,                                       // 1101
                                r.firstNode(), r.lastNode());                                      // 1102
  },                                                                                               // 1103
  findAll: function (selector) {                                                                   // 1104
    var r = this._range;                                                                           // 1105
    return DomUtils.findAllClipped(r.containerNode(), selector,                                    // 1106
                                   r.firstNode(), r.lastNode());                                   // 1107
  },                                                                                               // 1108
  hasDom: function () {                                                                            // 1109
    return !! this._range;                                                                         // 1110
  }                                                                                                // 1111
});                                                                                                // 1112
                                                                                                   // 1113
Spark.UNIQUE_LABEL = ['UNIQUE_LABEL'];                                                             // 1114
                                                                                                   // 1115
// label must be a string.                                                                         // 1116
// or pass label === null to not drop a label after all (meaning that                              // 1117
// this function is a noop)                                                                        // 1118
//                                                                                                 // 1119
Spark.labelBranch = function (label, htmlFunc) {                                                   // 1120
  var renderer = currentRenderer.get();                                                            // 1121
  if (! renderer || label === null)                                                                // 1122
    return htmlFunc();                                                                             // 1123
                                                                                                   // 1124
  if (label === Spark.UNIQUE_LABEL)                                                                // 1125
    label = Random.id();                                                                           // 1126
                                                                                                   // 1127
  renderer.currentBranch.pushLabel(label);                                                         // 1128
  var html = htmlFunc();                                                                           // 1129
  var occupied = renderer.currentBranch.getNotes().occupied;                                       // 1130
  renderer.currentBranch.popLabel();                                                               // 1131
                                                                                                   // 1132
  if (! occupied)                                                                                  // 1133
    // don't create annotation if branch doesn't contain any landmarks.                            // 1134
    // if this label isn't on an element-level HTML boundary, then that                            // 1135
    // is certainly the case.                                                                      // 1136
    return html;                                                                                   // 1137
                                                                                                   // 1138
  return renderer.annotate(                                                                        // 1139
    html, ANNOTATION_LABEL, { label: label });                                                     // 1140
                                                                                                   // 1141
  // XXX what happens if the user doesn't use the return value, or                                 // 1142
  // doesn't use it directly, eg, swaps the branches of the tree                                   // 1143
  // around? "that's an error?" the result would be that the apparent                              // 1144
  // branch path of a landmark at render time would be different from                              // 1145
  // its apparent branch path in the actual document. seems like the                               // 1146
  // answer is to have labelBranch not drop an annotation, and keep                                // 1147
  // the branch label info outside of the DOM in a parallel tree of                                // 1148
  // labels and landmarks (likely similar to the one we're already                                 // 1149
  // keeping?) a little tricky since not every node in the label tree                              // 1150
  // is actually populated with a landmark? (though we could change                                // 1151
  // that I guess -- they would be landmarks without any specific DOM                              // 1152
  // nodes?)                                                                                       // 1153
};                                                                                                 // 1154
                                                                                                   // 1155
Spark.createLandmark = function (options, htmlFunc) {                                              // 1156
  var renderer = currentRenderer.get();                                                            // 1157
  if (! renderer) {                                                                                // 1158
    // no renderer -- create and destroy Landmark inline                                           // 1159
    var landmark = new Spark.Landmark;                                                             // 1160
    options.created && options.created.call(landmark);                                             // 1161
    var html = htmlFunc(landmark);                                                                 // 1162
    options.destroyed && options.destroyed.call(landmark);                                         // 1163
    return html;                                                                                   // 1164
  }                                                                                                // 1165
                                                                                                   // 1166
  // Normalize preserve map                                                                        // 1167
  var preserve = {};                                                                               // 1168
  if (_.isArray(options.preserve))                                                                 // 1169
    _.each(options.preserve, function (selector) {                                                 // 1170
      preserve[selector] = true;                                                                   // 1171
    });                                                                                            // 1172
  else                                                                                             // 1173
    preserve = options.preserve || {};                                                             // 1174
  for (var selector in preserve)                                                                   // 1175
    if (typeof preserve[selector] !== 'function')                                                  // 1176
      preserve[selector] = function () { return true; };                                           // 1177
                                                                                                   // 1178
  renderer.currentBranch.mark('occupied');                                                         // 1179
  var notes = renderer.currentBranch.getNotes();                                                   // 1180
  var landmark;                                                                                    // 1181
  if (notes.originalRange) {                                                                       // 1182
    if (notes.originalRange.superceded)                                                            // 1183
      throw new Error("Can't create second landmark in same branch");                              // 1184
    notes.originalRange.superceded = true; // prevent destroyed(), second match                    // 1185
    landmark = notes.originalRange.landmark; // the old Landmark                                   // 1186
  } else {                                                                                         // 1187
    landmark = new Spark.Landmark;                                                                 // 1188
    if (options.created) {                                                                         // 1189
      // Run callback outside the current Spark.isolate's deps context.                            // 1190
      Deps.nonreactive(function () {                                                               // 1191
        options.created.call(landmark);                                                            // 1192
      });                                                                                          // 1193
    }                                                                                              // 1194
  }                                                                                                // 1195
  notes.landmark = landmark;                                                                       // 1196
                                                                                                   // 1197
  var html = htmlFunc(landmark);                                                                   // 1198
  return renderer.annotate(                                                                        // 1199
    html, ANNOTATION_LANDMARK, function (range) {                                                  // 1200
      if (! range) {                                                                               // 1201
        // annotation not used                                                                     // 1202
        options.destroyed && options.destroyed.call(landmark);                                     // 1203
        return;                                                                                    // 1204
      }                                                                                            // 1205
                                                                                                   // 1206
      _.extend(range, {                                                                            // 1207
        preserve: preserve,                                                                        // 1208
        constant: !! options.constant,                                                             // 1209
        rendered: options.rendered || function () {},                                              // 1210
        destroyed: options.destroyed || function () {},                                            // 1211
        landmark: landmark,                                                                        // 1212
        finalize: function () {                                                                    // 1213
          if (! this.superceded) {                                                                 // 1214
            this.landmark._range = null;                                                           // 1215
            this.destroyed.call(this.landmark);                                                    // 1216
          }                                                                                        // 1217
        }                                                                                          // 1218
      });                                                                                          // 1219
                                                                                                   // 1220
      landmark._range = range;                                                                     // 1221
      renderer.landmarkRanges.push(range);                                                         // 1222
      // Help GC avoid an actual memory leak (#1157) by nulling the                                // 1223
      // `renderer` local variable, which holds data structures about                              // 1224
      // the preservation and patching performed during this rendering                             // 1225
      // pass, including references to the old LiveRanges.  If                                     // 1226
      // `renderer` is retained by the LiveRange we initialize here,                               // 1227
      // it creates a chain linking the new LiveRanges to the                                      // 1228
      // renderer, to the old LiveRanges, to the old renderer, etc.                                // 1229
      //                                                                                           // 1230
      // The reason the new LiveRange might retains `renderer` has to                              // 1231
      // do with how V8 implements closures.  V8 considers                                         // 1232
      // `range.finalize` to close over `renderer`, even though it                                 // 1233
      // doesn't use it.  Because `renderer` is used by *some* nested                              // 1234
      // closure, it apparently is retained by all nested closures as                              // 1235
      // part of `Spark.createLandmark`'s function context.                                        // 1236
      renderer = null;                                                                             // 1237
    });                                                                                            // 1238
};                                                                                                 // 1239
                                                                                                   // 1240
SparkTest.getEnclosingLandmark = function (node) {                                                 // 1241
  var range = findRangeOfType(ANNOTATION_LANDMARK, node);                                          // 1242
  return range ? range.landmark : null;                                                            // 1243
};                                                                                                 // 1244
                                                                                                   // 1245
/////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                 //
// packages/spark/patch.js                                                                         //
//                                                                                                 //
/////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                   //
patch = function(tgtParent, srcParent, tgtBefore, tgtAfter, preservations,                         // 1
                 results) {                                                                        // 2
                                                                                                   // 3
  var copyFunc = function(t, s) {                                                                  // 4
    LiveRange.transplantTag(TAG, t, s);                                                            // 5
  };                                                                                               // 6
                                                                                                   // 7
  var patcher = new Patcher(                                                                       // 8
    tgtParent, srcParent, tgtBefore, tgtAfter);                                                    // 9
                                                                                                   // 10
                                                                                                   // 11
  var visitNodes = function(parent, before, after, func) {                                         // 12
    for(var n = before ? before.nextSibling : parent.firstChild;                                   // 13
        n && n !== after;                                                                          // 14
        n = n.nextSibling) {                                                                       // 15
      if (func(n) !== false && n.firstChild)                                                       // 16
        visitNodes(n, null, null, func);                                                           // 17
    }                                                                                              // 18
  };                                                                                               // 19
                                                                                                   // 20
  // results arg is optional; it is mutated if provided; returned either way                       // 21
  results = (results || {});                                                                       // 22
  // array of LiveRanges that were successfully preserved from                                     // 23
  // the region preservations                                                                      // 24
  var regionPreservations = (results.regionPreservations =                                         // 25
                             results.regionPreservations || []);                                   // 26
                                                                                                   // 27
  var lastTgtMatch = null;                                                                         // 28
                                                                                                   // 29
  visitNodes(srcParent, null, null, function(src) {                                                // 30
    // XXX inefficient to scan for match for every node!                                           // 31
    // We could at least skip non-element nodes, except for "range matches"                        // 32
    // used for constant chunks, which may begin on a non-element.                                 // 33
    // But really this shouldn't be a linear search.                                               // 34
    var pres = _.find(preservations, function (p) {                                                // 35
      // find preserved region starting at `src`, if any                                           // 36
      return p.type === 'region' && p.newRange.firstNode() === src;                                // 37
    }) || _.find(preservations, function (p) {                                                     // 38
      // else, find preservation of `src`                                                          // 39
      return p.type === 'node' && p.to === src;                                                    // 40
    });                                                                                            // 41
                                                                                                   // 42
    if (pres) {                                                                                    // 43
      var tgt = (pres.type === 'region' ? pres.fromStart : pres.from);                             // 44
      if (! lastTgtMatch ||                                                                        // 45
          DomUtils.compareElementIndex(lastTgtMatch, tgt) < 0) {                                   // 46
        if (pres.type === 'region') {                                                              // 47
          // preserved region for constant landmark                                                // 48
          if (patcher.match(pres.fromStart, pres.newRange.firstNode(),                             // 49
                            copyFunc, true)) {                                                     // 50
            patcher.skipToSiblings(pres.fromEnd, pres.newRange.lastNode());                        // 51
            // without knowing or caring what DOM nodes are in pres.newRange,                      // 52
            // transplant the range data to pres.fromStart and pres.fromEnd                        // 53
            // (including references to enclosing ranges).                                         // 54
            LiveRange.transplantRange(                                                             // 55
              pres.fromStart, pres.fromEnd, pres.newRange);                                        // 56
            regionPreservations.push(pres.newRange);                                               // 57
          }                                                                                        // 58
        } else if (pres.type === 'node') {                                                         // 59
          if (patcher.match(tgt, src, copyFunc)) {                                                 // 60
            // match succeeded                                                                     // 61
            lastTgtMatch = tgt;                                                                    // 62
            if (tgt.firstChild || src.firstChild) {                                                // 63
              if (tgt.nodeName !== "TEXTAREA" && tgt.nodeName !== "SELECT") {                      // 64
                // Don't patch contents of TEXTAREA tag (which are only the                        // 65
                // initial contents but may affect the tag's .value in IE) or of                   // 66
                // SELECT (which is specially handled in _copyAttributes).                         // 67
                // Otherwise recurse!                                                              // 68
                patch(tgt, src, null, null, preservations);                                        // 69
              }                                                                                    // 70
            }                                                                                      // 71
            return false; // tell visitNodes not to recurse                                        // 72
          }                                                                                        // 73
        }                                                                                          // 74
      }                                                                                            // 75
    }                                                                                              // 76
    return true;                                                                                   // 77
  });                                                                                              // 78
                                                                                                   // 79
  patcher.finish();                                                                                // 80
                                                                                                   // 81
  return results;                                                                                  // 82
};                                                                                                 // 83
                                                                                                   // 84
                                                                                                   // 85
// A Patcher manages the controlled replacement of a region of the DOM.                            // 86
// The target region is changed in place to match the source region.                               // 87
//                                                                                                 // 88
// The target region consists of the children of tgtParent, extending from                         // 89
// the child after tgtBefore to the child before tgtAfter.  A null                                 // 90
// or absent tgtBefore or tgtAfter represents the beginning or end                                 // 91
// of tgtParent's children.  The source region consists of all children                            // 92
// of srcParent, which may be a DocumentFragment.                                                  // 93
//                                                                                                 // 94
// To use a new Patcher, call `match` zero or more times followed by                               // 95
// `finish`.                                                                                       // 96
//                                                                                                 // 97
// A match is a correspondence between an old node in the target region                            // 98
// and a new node in the source region that will replace it.  Based on                             // 99
// this correspondence, the target node is preserved and the attributes                            // 100
// and children of the source node are copied over it.  The `match`                                // 101
// method declares such a correspondence.  A Patcher that makes no matches,                        // 102
// for example, just removes the target nodes and inserts the source nodes                         // 103
// in their place.                                                                                 // 104
//                                                                                                 // 105
// Constructor:                                                                                    // 106
Patcher = function(tgtParent, srcParent, tgtBefore, tgtAfter) {                                    // 107
  this.tgtParent = tgtParent;                                                                      // 108
  this.srcParent = srcParent;                                                                      // 109
                                                                                                   // 110
  this.tgtBefore = tgtBefore;                                                                      // 111
  this.tgtAfter = tgtAfter;                                                                        // 112
                                                                                                   // 113
  this.lastKeptTgtNode = null;                                                                     // 114
  this.lastKeptSrcNode = null;                                                                     // 115
};                                                                                                 // 116
                                                                                                   // 117
                                                                                                   // 118
// Advances the patching process up to tgtNode in the target tree,                                 // 119
// and srcNode in the source tree.  tgtNode will be preserved, with                                // 120
// the attributes of srcNode copied over it, in essence identifying                                // 121
// the two nodes with each other.  The same treatment is given to                                  // 122
// any parents of the nodes that are newly implicated as corresponding.                            // 123
// In the process of traversing from the last matched nodes to these                               // 124
// ones, all nodes "in between" in the target document, at any level,                              // 125
// are removed, and all nodes "in between" in the source document                                  // 126
// are copied over to their appropriate positions.                                                 // 127
//                                                                                                 // 128
// For example, if match() is called only once, and then finish()                                  // 129
// is called, the effect is to preserve tgtNode, its children,                                     // 130
// and its ancestors (parent chain), while swapping out all its                                    // 131
// siblings and the siblings of its ancestors, so that the target                                  // 132
// tree is mutated to look like the source tree did.                                               // 133
//                                                                                                 // 134
// The caller is responsible for ensuring the precondition that                                    // 135
// subsequent tgtNodes and subsequent srcNodes are strictly "in order."                            // 136
// The ordering referred to here is a partial order in which A comes                               // 137
// before B if their tags would be disjoint in HTML, i.e. the end of                               // 138
// A comes before the beginning of B.  Put another way, there is some                              // 139
// ancestor of A and some ancestor of B that have the same parent,                                 // 140
// are different, and are in order.                                                                // 141
//                                                                                                 // 142
// There are other requirements for two nodes to be "matched,"                                     // 143
// but match() can detect them and exit gracefully returning false.                                // 144
// For example, the tag-names must be the same, and the tag-names                                  // 145
// of their parents.  More subtly, it may be impossible to match                                   // 146
// the parents of tgtNode or srcNode because they have been                                        // 147
// previously matched.  If we are to match a series of P tags                                      // 148
// that are each inside one DIV, for example, is it the same DIV                                   // 149
// or not?  If the source and target disagree, we will have to                                     // 150
// reparent one of the Ps.  Users should not be moving identified                                  // 151
// nodes, but we want to still be correct (fall back on replacement)                               // 152
// if they do.                                                                                     // 153
//                                                                                                 // 154
// If false is returned, the match was impossible, but patching                                    // 155
// can continue and will still be otherwise correct.  The next call                                // 156
// to match() must still obey the order constraint, as the patcher                                 // 157
// internally only moves forwards and patches as it goes.                                          // 158
//                                                                                                 // 159
// copyCallback is called on every new matched (tgt, src) pair                                     // 160
// right after copying attributes.  It's a good time to transplant                                 // 161
// liveranges and patch children.                                                                  // 162
Patcher.prototype.match = function(                                                                // 163
  tgtNode, srcNode, copyCallback, onlyAdvance) {                                                   // 164
                                                                                                   // 165
  // last nodes "kept" (matched/identified with each other)                                        // 166
  var lastKeptTgt = this.lastKeptTgtNode;                                                          // 167
  var lastKeptSrc = this.lastKeptSrcNode;                                                          // 168
  // nodes to match and keep, this time around                                                     // 169
  var tgt = tgtNode;                                                                               // 170
  var src = srcNode;                                                                               // 171
                                                                                                   // 172
  if ((! tgt) != (! src)) {                                                                        // 173
    return false; // truthinesses don't match                                                      // 174
  }                                                                                                // 175
                                                                                                   // 176
  var starting = ! lastKeptTgt;                                                                    // 177
  var finishing = ! tgt;                                                                           // 178
                                                                                                   // 179
  if (! starting) {                                                                                // 180
    // move lastKeptTgt/lastKeptSrc forward and out,                                               // 181
    // until they are siblings of tgt/src or of an ancestor of tgt/src,                            // 182
    // replacing as we go.  If tgt/src is falsy, we make it to the                                 // 183
    // top level.                                                                                  // 184
    while (lastKeptTgt.parentNode !== this.tgtParent &&                                            // 185
           ! (tgt && DomUtils.elementContains(lastKeptTgt.parentNode, tgt))) {                     // 186
      // Last-kept nodes are inside parents that are not                                           // 187
      // parents of the newly matched nodes.  Must finish                                          // 188
      // replacing their contents and back out.                                                    // 189
      this._replaceNodes(lastKeptTgt, null, lastKeptSrc, null);                                    // 190
      lastKeptTgt = lastKeptTgt.parentNode;                                                        // 191
      lastKeptSrc = lastKeptSrc.parentNode;                                                        // 192
    }                                                                                              // 193
                                                                                                   // 194
    // update instance vars; there's no going back inside these nodes                              // 195
    this.lastKeptTgtNode = lastKeptTgt;                                                            // 196
    this.lastKeptSrcNode = lastKeptSrc;                                                            // 197
                                                                                                   // 198
    // Make sure same number of levels of "moving up" are                                          // 199
    // appropriate for src as well, i.e. we aren't trying                                          // 200
    // to match <c> in (<a><b/><c/></a>, <a><b/></a><a><c/></a>)                                   // 201
    // after matching <b>, or vice versa.  In other words,                                         // 202
    // if tag names and depths match, but identities of parents                                    // 203
    // are inconsistent relative to previous matches, we catch it                                  // 204
    // here.  In the example, lastKeptTgt would be the <b/> node                                   // 205
    // on the left, which is not sibling of <c/> or of an ancestor                                 // 206
    // of <c/> on the right.  If the example were reversed,                                        // 207
    // lastKeptTgt would be the first <a> node, which is an                                        // 208
    // ancestor of <c/> on the left rather than a sibling of an                                    // 209
    // ancestor.                                                                                   // 210
    if (! finishing &&                                                                             // 211
        (DomUtils.elementContains(lastKeptSrc, src) ||                                             // 212
         ! (lastKeptSrc.parentNode === this.srcParent ||                                           // 213
            DomUtils.elementContains(lastKeptSrc.parentNode, src)))) {                             // 214
      return false;                                                                                // 215
    }                                                                                              // 216
  }                                                                                                // 217
                                                                                                   // 218
  if (finishing) {                                                                                 // 219
    this._replaceNodes(lastKeptTgt, null, lastKeptSrc, null,                                       // 220
                       this.tgtParent, this.srcParent);                                            // 221
  } else {                                                                                         // 222
    // Compare tag names and depths to make sure we can match nodes...                             // 223
    if (! onlyAdvance) {                                                                           // 224
      if (tgt.nodeName !== src.nodeName)                                                           // 225
        return false;                                                                              // 226
    }                                                                                              // 227
                                                                                                   // 228
    // Look at tags of parents until we hit parent of last-kept,                                   // 229
    // which we know is ok.                                                                        // 230
    for(var a=tgt.parentNode, b=src.parentNode;                                                    // 231
        a !== (starting ? this.tgtParent : lastKeptTgt.parentNode);                                // 232
        a = a.parentNode, b = b.parentNode) {                                                      // 233
      if (b === (starting ? this.srcParent : lastKeptSrc.parentNode))                              // 234
        return false; // src is shallower, b hit top first                                         // 235
      if (a.nodeName !== b.nodeName)                                                               // 236
        return false; // tag names don't match                                                     // 237
    }                                                                                              // 238
    if (b !== (starting ? this.srcParent : lastKeptSrc.parentNode)) {                              // 239
      return false; // src is deeper, b didn't hit top when a did                                  // 240
    }                                                                                              // 241
                                                                                                   // 242
    var firstIter = true;                                                                          // 243
    // move tgt and src backwards and out, replacing as we go                                      // 244
    while (true) {                                                                                 // 245
      if (! (firstIter && onlyAdvance)) {                                                          // 246
        if (tgt.nodeType === 1) /* ELEMENT */                                                      // 247
          Patcher._copyAttributes(tgt, src);                                                       // 248
        if (copyCallback)                                                                          // 249
          copyCallback(tgt, src);                                                                  // 250
      }                                                                                            // 251
                                                                                                   // 252
      firstIter = false;                                                                           // 253
                                                                                                   // 254
      if ((starting ? this.tgtParent : lastKeptTgt.parentNode)                                     // 255
          === tgt.parentNode) {                                                                    // 256
        // we've worked our way up to the same level as the last-kept nodes                        // 257
        this._replaceNodes(lastKeptTgt, tgt, lastKeptSrc, src);                                    // 258
        break;                                                                                     // 259
      } else {                                                                                     // 260
        this._replaceNodes(null, tgt, null, src);                                                  // 261
        // move up to keep (match) parents as well                                                 // 262
        tgt = tgt.parentNode;                                                                      // 263
        src = src.parentNode;                                                                      // 264
      }                                                                                            // 265
    }                                                                                              // 266
  }                                                                                                // 267
                                                                                                   // 268
  this.lastKeptTgtNode = tgtNode;                                                                  // 269
  this.lastKeptSrcNode = srcNode;                                                                  // 270
                                                                                                   // 271
  return true;                                                                                     // 272
};                                                                                                 // 273
                                                                                                   // 274
// After a match, skip ahead to later siblings of the last kept nodes,                             // 275
// without performing any replacements.                                                            // 276
Patcher.prototype.skipToSiblings = function(tgt, src) {                                            // 277
  var lastTgt = this.lastKeptTgtNode;                                                              // 278
  var lastSrc = this.lastKeptSrcNode;                                                              // 279
                                                                                                   // 280
  if (! (lastTgt && lastTgt.parentNode === tgt.parentNode))                                        // 281
    return false;                                                                                  // 282
                                                                                                   // 283
  if (! (lastSrc && lastSrc.parentNode === src.parentNode))                                        // 284
    return false;                                                                                  // 285
                                                                                                   // 286
  this.lastKeptTgtNode = tgt;                                                                      // 287
  this.lastKeptSrcNode = src;                                                                      // 288
                                                                                                   // 289
  return true;                                                                                     // 290
};                                                                                                 // 291
                                                                                                   // 292
// Completes patching assuming no more matches.                                                    // 293
//                                                                                                 // 294
// Patchers are single-use, so no more methods can be called                                       // 295
// on the Patcher.                                                                                 // 296
Patcher.prototype.finish = function() {                                                            // 297
  return this.match(null, null);                                                                   // 298
};                                                                                                 // 299
                                                                                                   // 300
// Replaces the siblings between tgtBefore and tgtAfter (exclusive on both                         // 301
// sides) with the siblings between srcBefore and srcAfter (exclusive on both                      // 302
// sides).  Falsy values indicate start or end of siblings as appropriate.                         // 303
//                                                                                                 // 304
// Precondition: tgtBefore and tgtAfter have same parent; either may be falsy,                     // 305
// but not both, unless optTgtParent is provided.  Same with srcBefore/srcAfter.                   // 306
Patcher.prototype._replaceNodes = function(                                                        // 307
  tgtBefore, tgtAfter, srcBefore, srcAfter, optTgtParent, optSrcParent)                            // 308
{                                                                                                  // 309
  var tgtParent = optTgtParent || (tgtBefore || tgtAfter).parentNode;                              // 310
  var srcParent = optSrcParent || (srcBefore || srcAfter).parentNode;                              // 311
                                                                                                   // 312
  // deal with case where top level is a range                                                     // 313
  if (tgtParent === this.tgtParent) {                                                              // 314
    tgtBefore = tgtBefore || this.tgtBefore;                                                       // 315
    tgtAfter = tgtAfter || this.tgtAfter;                                                          // 316
  }                                                                                                // 317
  if (srcParent === this.srcParent) {                                                              // 318
    srcBefore = srcBefore || this.srcBefore;                                                       // 319
    srcAfter = srcAfter || this.srcAfter;                                                          // 320
  }                                                                                                // 321
                                                                                                   // 322
                                                                                                   // 323
  // remove old children                                                                           // 324
  var n;                                                                                           // 325
  while ((n = tgtBefore ? tgtBefore.nextSibling : tgtParent.firstChild)                            // 326
         && n !== tgtAfter) {                                                                      // 327
    tgtParent.removeChild(n);                                                                      // 328
  }                                                                                                // 329
                                                                                                   // 330
  // add new children                                                                              // 331
  var m;                                                                                           // 332
  while ((m = srcBefore ? srcBefore.nextSibling : srcParent.firstChild)                            // 333
         && m !== srcAfter) {                                                                      // 334
    tgtParent.insertBefore(m, tgtAfter || null);                                                   // 335
  }                                                                                                // 336
};                                                                                                 // 337
                                                                                                   // 338
// Copy HTML attributes of node `src` onto node `tgt`.                                             // 339
//                                                                                                 // 340
// The effect we are trying to achieve is best expresed in terms of                                // 341
// HTML.  Whatever HTML generated `tgt`, we want to mutate the DOM element                         // 342
// so that it is as if it were the HTML that generated `src`.                                      // 343
// We want to preserve JavaScript properties in general (tgt.foo),                                 // 344
// while syncing the HTML attributes (tgt.getAttribute("foo")).                                    // 345
//                                                                                                 // 346
// This is complicated by form controls and the fact that old IE                                   // 347
// can't keep the difference straight between properties and attributes.                           // 348
Patcher._copyAttributes = function(tgt, src) {                                                     // 349
  var srcAttrs = src.attributes;                                                                   // 350
  var tgtAttrs = tgt.attributes;                                                                   // 351
                                                                                                   // 352
  // Determine whether tgt has focus; works in all browsers                                        // 353
  // as of FF3, Safari4                                                                            // 354
  var targetFocused = (tgt === document.activeElement);                                            // 355
                                                                                                   // 356
  ///// Clear current attributes                                                                   // 357
                                                                                                   // 358
  if (tgt.style.cssText)                                                                           // 359
    tgt.style.cssText = '';                                                                        // 360
                                                                                                   // 361
  var isRadio = false;                                                                             // 362
  var finalChecked = null;                                                                         // 363
  if (tgt.nodeName === "INPUT") {                                                                  // 364
    // Record for later whether this is a radio button.                                            // 365
    isRadio = (tgt.type === 'radio');                                                              // 366
                                                                                                   // 367
    // Figure out whether this should be checked or not. If the re-rendering                       // 368
    // changed its idea of checkedness, go with that; otherwsie go with whatever                   // 369
    // the control's current setting is.                                                           // 370
    if (isRadio || tgt.type === 'checkbox') {                                                      // 371
      var tgtOriginalChecked = !!tgt._sparkOriginalRenderedChecked &&                              // 372
            tgt._sparkOriginalRenderedChecked[0];                                                  // 373
      var srcOriginalChecked = !!src._sparkOriginalRenderedChecked &&                              // 374
            src._sparkOriginalRenderedChecked[0];                                                  // 375
      // For radio buttons, we previously saved the checkedness in an expando                      // 376
      // property before doing some DOM operations that could wipe it out. For                     // 377
      // checkboxes, we can just use the checked property directly.                                // 378
      var tgtCurrentChecked = tgt._currentChecked ?                                                // 379
            tgt._currentChecked[0] : tgt.checked;                                                  // 380
      if (tgtOriginalChecked === srcOriginalChecked) {                                             // 381
        finalChecked = tgtCurrentChecked;                                                          // 382
      } else {                                                                                     // 383
        finalChecked = srcOriginalChecked;                                                         // 384
        tgt._sparkOriginalRenderedChecked = [finalChecked];                                        // 385
      }                                                                                            // 386
    }                                                                                              // 387
  }                                                                                                // 388
                                                                                                   // 389
  for(var i=tgtAttrs.length-1; i>=0; i--) {                                                        // 390
    var attr = tgtAttrs[i];                                                                        // 391
    // In old IE, attributes that are possible on a node                                           // 392
    // but not actually present will show up in this loop                                          // 393
    // with specified=false.  All other browsers support                                           // 394
    // 'specified' (because it's part of the spec) and                                             // 395
    // set it to true.                                                                             // 396
    if (! attr.specified)                                                                          // 397
      continue;                                                                                    // 398
    var name = attr.name;                                                                          // 399
    // Filter out attributes that are indexable by number                                          // 400
    // but not by name.  This kills the weird "propdescname"                                       // 401
    // attribute in IE 8.                                                                          // 402
    if (! tgtAttrs[name])                                                                          // 403
      continue;                                                                                    // 404
    // Some properties don't mutate well, and we simply                                            // 405
    // don't try to patch them.  For example, you can't                                            // 406
    // change a control's type in IE.                                                              // 407
    if (name === "id" || name === "type")                                                          // 408
      continue;                                                                                    // 409
    // Removing a radio button's "name" property and restoring                                     // 410
    // it is harmless in most browsers but breaks in IE 7.                                         // 411
    // It seems unlikely enough that a radio button will                                           // 412
    // sometimes have a group and sometimes not.                                                   // 413
    if (isRadio && name === "name")                                                                // 414
      continue;                                                                                    // 415
    // Never delete the "value" attribute: we have special three-way diff logic                    // 416
    // for it at the end.                                                                          // 417
    if (name === "value")                                                                          // 418
      continue;                                                                                    // 419
    // Removing 'src' (e.g. in an iframe) can only be bad.                                         // 420
    if (name === "src")                                                                            // 421
      continue;                                                                                    // 422
                                                                                                   // 423
    // We want to patch any HTML attributes that were specified in the                             // 424
    // source, but preserve DOM properties set programmatically.                                   // 425
    // Old IE makes this difficult by exposing properties as attributes.                           // 426
    // Expando properties will even appear in innerHTML, though not if the                         // 427
    // value is an object rather than a primitive.                                                 // 428
    //                                                                                             // 429
    // We use a heuristic to determine if we are looking at a programmatic                         // 430
    // property (an expando) rather than a DOM attribute.                                          // 431
    //                                                                                             // 432
    // Losing jQuery's expando (whose value is a number) is very bad,                              // 433
    // because it points to event handlers that only jQuery can detach,                            // 434
    // and only if the expando is in place.                                                        // 435
    var possibleExpando = tgt[name];                                                               // 436
    if (possibleExpando &&                                                                         // 437
        (typeof possibleExpando === "object" ||                                                    // 438
         /^jQuery/.test(name)))                                                                    // 439
      continue; // for object properties that surface attributes only in IE                        // 440
    tgt.removeAttributeNode(attr);                                                                 // 441
  }                                                                                                // 442
                                                                                                   // 443
  ///// Copy over src's attributes                                                                 // 444
                                                                                                   // 445
  if (tgt.mergeAttributes) {                                                                       // 446
    // IE code path:                                                                               // 447
    //                                                                                             // 448
    // Only IE (all versions) has mergeAttributes.                                                 // 449
    // It's probably a good bit faster in old IE than                                              // 450
    // iterating over all the attributes, and the treatment                                        // 451
    // of form controls is sufficiently different in IE from                                       // 452
    // other browsers that we keep the special cases separate.                                     // 453
                                                                                                   // 454
    // Don't copy _sparkOriginalRenderedValue, though.                                             // 455
    var srcExpando = src._sparkOriginalRenderedValue;                                              // 456
    src.removeAttribute('_sparkOriginalRenderedValue');                                            // 457
                                                                                                   // 458
    tgt.mergeAttributes(src);                                                                      // 459
    if (srcExpando)                                                                                // 460
      src._sparkOriginalRenderedValue = srcExpando;                                                // 461
                                                                                                   // 462
    if (src.name)                                                                                  // 463
      tgt.name = src.name;                                                                         // 464
                                                                                                   // 465
  } else {                                                                                         // 466
    // Non-IE code path:                                                                           // 467
                                                                                                   // 468
    for(var i=0, L=srcAttrs.length; i<L; i++) {                                                    // 469
      var srcA = srcAttrs.item(i);                                                                 // 470
      if (srcA.specified) {                                                                        // 471
        var name = srcA.name.toLowerCase();                                                        // 472
        var value = String(srcA.value);                                                            // 473
        if (name === "type") {                                                                     // 474
        // can't change type of INPUT in IE; don't support it                                      // 475
        } else if (name === "checked") {                                                           // 476
          // handled specially below                                                               // 477
        } else if (name === "style") {                                                             // 478
          tgt.style.cssText = src.style.cssText;                                                   // 479
        } else if (name === "class") {                                                             // 480
          tgt.className = src.className;                                                           // 481
        } else if (name === "value") {                                                             // 482
          // don't set attribute, just overwrite property                                          // 483
          // (in next phase)                                                                       // 484
        } else if (name === "src") {                                                               // 485
          // only set if different.  protects iframes                                              // 486
          if (src.src !== tgt.src)                                                                 // 487
            tgt.src = src.src;                                                                     // 488
        } else {                                                                                   // 489
          try {                                                                                    // 490
            tgt.setAttribute(name, value);                                                         // 491
          } catch (e) {                                                                            // 492
            throw new Error("Error copying attribute '" + name + "': " + e);                       // 493
          }                                                                                        // 494
        }                                                                                          // 495
      }                                                                                            // 496
    }                                                                                              // 497
  }                                                                                                // 498
                                                                                                   // 499
  var originalRenderedValue = function (node) {                                                    // 500
    if (!node._sparkOriginalRenderedValue)                                                         // 501
      return null;                                                                                 // 502
    return node._sparkOriginalRenderedValue[0];                                                    // 503
  };                                                                                               // 504
  var srcOriginalRenderedValue = originalRenderedValue(src);                                       // 505
  var tgtOriginalRenderedValue = originalRenderedValue(tgt);                                       // 506
                                                                                                   // 507
  // Save the target's current value.                                                              // 508
  var tgtCurrentValue = DomUtils.getElementValue(tgt);                                             // 509
                                                                                                   // 510
  if (tgt.nodeName === "SELECT") {                                                                 // 511
    // Copy over the descendents of the tag (eg, OPTIONs, OPTGROUPs, etc) so                       // 512
    // that we get the new version's OPTIONs. (We don't look for any more nested                   // 513
    // preserved regions inside the element.)                                                      // 514
    while (tgt.firstChild)                                                                         // 515
      tgt.removeChild(tgt.firstChild);                                                             // 516
    while (src.firstChild)                                                                         // 517
      tgt.insertBefore(src.firstChild, null);                                                      // 518
    // ... but preserve the original <SELECT>'s value if possible (ie, ignore                      // 519
    // any <OPTION SELECTED>s that we may have copied over).                                       // 520
    DomUtils.setElementValue(tgt, tgtCurrentValue);                                                // 521
  }                                                                                                // 522
                                                                                                   // 523
  // We preserve the old element's value unless both of the following are true:                    // 524
  //   - The newly rendered value is different from the old rendered value: ie,                    // 525
  //     something has actually changed on the server.                                             // 526
  //   - It's unfocused. If it's focused, the user might be editing it, and                        // 527
  //     we don't want to update what the user is currently editing (and lose                      // 528
  //     the selection, etc).                                                                      // 529
  //                                                                                               // 530
  // After updating the element's value, we update its                                             // 531
  // _sparkOriginalRenderedValue to match.                                                         // 532
  //                                                                                               // 533
  // There's a case where we choose to update _sparkOriginalRenderedValue even                     // 534
  // though we're not updating the visible value. That's when the element is                       // 535
  // focused (preventing us from updating the visible value), but the newly                        // 536
  // rendered value matches the visible value. In this case, updating the                          // 537
  // visible value would have been a no-op, so we can do the matching                              // 538
  // _sparkOriginalRenderedValue update.                                                           // 539
  //                                                                                               // 540
  // Note that we expect src._sparkOriginalRenderedValue[0] to be equal to                         // 541
  // src.value. For <LI>'s, though, there is a value property (the ordinal in                      // 542
  // the list) even though there is no value attribute (and thus no saved                          // 543
  // _sparkOriginalRenderedValue), so we do have to be sure to do the comparison                   // 544
  // with src._sparkOriginalRenderedValue[0] rather than with src.value.                           // 545
  if (srcOriginalRenderedValue !== tgtOriginalRenderedValue &&                                     // 546
      (tgtCurrentValue === srcOriginalRenderedValue || !targetFocused)) {                          // 547
    // Update the on-screen value to the newly rendered value, but only if it's                    // 548
    // an actual change (a seemingly "no-op" value update resets the selection,                    // 549
    // so don't do that!)                                                                          // 550
    if (tgtCurrentValue !== srcOriginalRenderedValue)                                              // 551
      DomUtils.setElementValue(tgt, srcOriginalRenderedValue);                                     // 552
    // ... and overwrite the saved rendered value too, so that the next time                       // 553
    // around we'll be comparing to this rendered value instead of the old one.                    // 554
    tgt._sparkOriginalRenderedValue = [srcOriginalRenderedValue];                                  // 555
  }                                                                                                // 556
                                                                                                   // 557
  // Deal with checkboxes and radios.                                                              // 558
  if (finalChecked !== null) {                                                                     // 559
    // Don't do a no-op write to 'checked', since in some browsers that triggers                   // 560
    // events.                                                                                     // 561
    if (tgt.checked !== finalChecked)                                                              // 562
      tgt.checked = finalChecked;                                                                  // 563
                                                                                                   // 564
    // Set various other fields related to checkedness.                                            // 565
    tgt.defaultChecked = finalChecked;                                                             // 566
    if (finalChecked)                                                                              // 567
      tgt.setAttribute("checked", "checked");                                                      // 568
    else                                                                                           // 569
      tgt.removeAttribute("checked");                                                              // 570
  }                                                                                                // 571
};                                                                                                 // 572
                                                                                                   // 573
SparkTest.Patcher = Patcher;                                                                       // 574
                                                                                                   // 575
/////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                 //
// packages/spark/convenience.js                                                                   //
//                                                                                                 //
/////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                   //
Meteor.render = function (htmlFunc) {                                                              // 1
  return Spark.render(function () {                                                                // 2
    return Spark.isolate(                                                                          // 3
      typeof htmlFunc === 'function' ? htmlFunc : function() {                                     // 4
        // non-function argument becomes a constant (non-reactive) string                          // 5
        return String(htmlFunc);                                                                   // 6
      });                                                                                          // 7
  });                                                                                              // 8
};                                                                                                 // 9
                                                                                                   // 10
Meteor.renderList = function (cursor, itemFunc, elseFunc) {                                        // 11
  return Spark.render(function () {                                                                // 12
    return Spark.list(cursor, function (item) {                                                    // 13
      var label = item._id ? idStringify(item._id) : null;                                         // 14
      return Spark.labelBranch(label, function () {                                                // 15
        return Spark.isolate(_.bind(itemFunc, null, item));                                        // 16
      });                                                                                          // 17
    }, function () {                                                                               // 18
      return elseFunc ? Spark.isolate(elseFunc) : '';                                              // 19
    });                                                                                            // 20
  });                                                                                              // 21
};                                                                                                 // 22
                                                                                                   // 23
/////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                 //
// packages/spark/utils.js                                                                         //
//                                                                                                 //
/////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                   //
Spark._labelFromIdOrName = function(n) {                                                           // 1
  var label = null;                                                                                // 2
                                                                                                   // 3
  if (n.nodeType === 1 /*ELEMENT_NODE*/) {                                                         // 4
    if (n.getAttribute('id')) {                                                                    // 5
      label = '#' + n.getAttribute('id');                                                          // 6
    } else if (n.getAttribute("name")) {                                                           // 7
      label = n.getAttribute("name");                                                              // 8
      // Radio button special case:  radio buttons                                                 // 9
      // in a group all have the same name.  Their value                                           // 10
      // determines their identity.                                                                // 11
      // Checkboxes with the same name and different                                               // 12
      // values are also sometimes used in apps, so                                                // 13
      // we treat them similarly.                                                                  // 14
      if (n.nodeName === 'INPUT' &&                                                                // 15
          (n.type === 'radio' || n.type === 'checkbox') &&                                         // 16
          n.value)                                                                                 // 17
        label = label + ':' + n.value;                                                             // 18
                                                                                                   // 19
      // include parent names and IDs up to enclosing ID                                           // 20
      // in the label                                                                              // 21
      while (n.parentNode &&                                                                       // 22
             n.parentNode.nodeType === 1 /*ELEMENT_NODE*/) {                                       // 23
        n = n.parentNode;                                                                          // 24
        if (n.id) {                                                                                // 25
          label = '#' + n.id + "/" + label;                                                        // 26
          break;                                                                                   // 27
        } else if (n.getAttribute('name')) {                                                       // 28
          label = n.getAttribute('name') + "/" + label;                                            // 29
        }                                                                                          // 30
      }                                                                                            // 31
    }                                                                                              // 32
  }                                                                                                // 33
                                                                                                   // 34
  return label;                                                                                    // 35
};                                                                                                 // 36
                                                                                                   // 37
/////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);
