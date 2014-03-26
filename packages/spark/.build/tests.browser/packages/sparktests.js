(function () {

//////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                          //
// packages/spark/spark_tests.js                                                            //
//                                                                                          //
//////////////////////////////////////////////////////////////////////////////////////////////
                                                                                            //
// XXX make sure that when tests use id="..." to trigger patching, "preserve" happens       // 1
// XXX test that events inside constant regions still work after patching                   // 2
// XXX test arguments to landmark rendered callback                                         // 3
// XXX test variable wrapping (eg TR vs THEAD) inside each branch of Spark.list?            // 4
                                                                                            // 5
                                                                                            // 6
SparkTest.setCheckIECompliance(true);                                                       // 7
                                                                                            // 8
// Tests can use {preserve: idNameLabels} or renderWithPreservation                         // 9
// to cause any element with an id or name to be preserved.  This effect                    // 10
// is similar to what the preserve-inputs package does, though it applies                   // 11
// to all elements, not just inputs.                                                        // 12
                                                                                            // 13
var idNameLabels = {                                                                        // 14
  '*[id], *[name]': Spark._labelFromIdOrName                                                // 15
};                                                                                          // 16
                                                                                            // 17
var renderWithPreservation = function (htmlFunc) {                                          // 18
  return Meteor.render(function () {                                                        // 19
    return Spark.createLandmark({ preserve: idNameLabels}, htmlFunc);                       // 20
  });                                                                                       // 21
};                                                                                          // 22
                                                                                            // 23
var eventmap = function (/*args*/) {                                                        // 24
  // support event_buf as final argument                                                    // 25
  var event_buf = null;                                                                     // 26
  if (arguments.length && _.isArray(arguments[arguments.length-1])) {                       // 27
    event_buf = arguments[arguments.length-1];                                              // 28
    arguments.length--;                                                                     // 29
  }                                                                                         // 30
  var events = {};                                                                          // 31
  _.each(arguments, function (esel) {                                                       // 32
    var etyp = esel.split(' ')[0];                                                          // 33
    events[esel] = function (evt) {                                                         // 34
      if (evt.type !== etyp)                                                                // 35
        throw new Error(etyp+" event arrived as "+evt.type);                                // 36
      (event_buf || this).push(esel);                                                       // 37
    };                                                                                      // 38
  });                                                                                       // 39
  return events;                                                                            // 40
};                                                                                          // 41
                                                                                            // 42
var nodesToArray = function (array) {                                                       // 43
  // Starting in underscore 1.4, _.toArray does not work right on a node                    // 44
  // list in IE8. This is a workaround to support IE8.                                      // 45
  return _.map(array, _.identity);                                                          // 46
};                                                                                          // 47
                                                                                            // 48
Tinytest.add("spark - assembly", function (test) {                                          // 49
                                                                                            // 50
  var furtherCanon = function(str) {                                                        // 51
    // further canonicalize innerHTML in IE by adding close                                 // 52
    // li tags to "<ul><li>one<li>two<li>three</li></ul>"                                   // 53
    return str.replace(/<li>(\w*)(?=<li>)/g, function(s) {                                  // 54
      return s+"</li>";                                                                     // 55
    });                                                                                     // 56
  };                                                                                        // 57
                                                                                            // 58
  var doTest = function (calc) {                                                            // 59
    var frag = Spark.render(function () {                                                   // 60
      return calc(function (str, expected) {                                                // 61
        return Spark.setDataContext(null, str);                                             // 62
      });                                                                                   // 63
    });                                                                                     // 64
    var groups = [];                                                                        // 65
    var html = calc(function (str, expected, noRange) {                                     // 66
      if (arguments.length > 1)                                                             // 67
        str = expected;                                                                     // 68
      if (! noRange)                                                                        // 69
        groups.push(str);                                                                   // 70
      return str;                                                                           // 71
    });                                                                                     // 72
    var f = WrappedFrag(frag);                                                              // 73
    test.equal(furtherCanon(f.html()), html);                                               // 74
                                                                                            // 75
    var actualGroups = [];                                                                  // 76
    var tempRange = new LiveRange(SparkTest.TAG, frag);                                     // 77
    tempRange.visit(function (isStart, rng) {                                               // 78
      if (! isStart && rng.type === "data" /* Spark._ANNOTATION_DATA */)                    // 79
        actualGroups.push(furtherCanon(canonicalizeHtml(                                    // 80
          DomUtils.rangeToHtml(rng.firstNode(), rng.lastNode()))));                         // 81
    });                                                                                     // 82
    test.equal(actualGroups.join(','), groups.join(','));                                   // 83
  };                                                                                        // 84
                                                                                            // 85
  doTest(function (A) { return "<p>Hello</p>"; });                                          // 86
  doTest(function (A) { return "<td>Hello</td><td>World</td>"; });                          // 87
  doTest(function (A) { return "<td>"+A("Hello")+"</td>"; });                               // 88
  doTest(function (A) { return A("<td>"+A("Hello")+"</td>"); });                            // 89
  doTest(function (A) { return A(A(A(A(A(A("foo")))))); });                                 // 90
  doTest(                                                                                   // 91
    function (A) { return "<div>Yo"+A("<p>Hello "+A(A("World")),"<p>Hello World</p>")+      // 92
                  "</div>"; });                                                             // 93
  doTest(function (A) {                                                                     // 94
    return A("<ul>"+A("<li>one","<li>one</li>")+                                            // 95
             A("<li>two","<li>two</li>")+                                                   // 96
             A("<li>three","<li>three</li>"),                                               // 97
             "<ul><li>one</li><li>two</li><li>three</li></ul>"); });                        // 98
                                                                                            // 99
  doTest(function (A) {                                                                     // 100
    return A("<table>"+A("<tr>"+A("<td>"+A("Hi")+"</td>")+"</tr>")+"</table>",              // 101
             "<table><tbody><tr><td>Hi</td></tr></tbody></table>");                         // 102
  });                                                                                       // 103
                                                                                            // 104
  test.throws(function () {                                                                 // 105
    doTest(function (A) {                                                                   // 106
      var z = A("Hello");                                                                   // 107
      return z+z;                                                                           // 108
    });                                                                                     // 109
  });                                                                                       // 110
                                                                                            // 111
  var frag = Spark.render(function () {                                                     // 112
    return '<div foo="abc' +                                                                // 113
      Spark.setDataContext(null, "bar") +                                                   // 114
      'xyz">Hello</div>';                                                                   // 115
  });                                                                                       // 116
  var div = frag.firstChild;                                                                // 117
  test.equal(div.nodeName, "DIV");                                                          // 118
  var attrValue = div.getAttribute('foo');                                                  // 119
  test.isTrue(attrValue.indexOf('abc<!--') === 0, attrValue);                               // 120
  test.isTrue(attrValue.indexOf('-->xyz') >= 0, attrValue);                                 // 121
});                                                                                         // 122
                                                                                            // 123
                                                                                            // 124
Tinytest.add("spark - repeat inclusion", function(test) {                                   // 125
  test.throws(function() {                                                                  // 126
    var frag = Spark.render(function() {                                                    // 127
      var x = Spark.setDataContext({}, "abc");                                              // 128
      return x + x;                                                                         // 129
    });                                                                                     // 130
  });                                                                                       // 131
});                                                                                         // 132
                                                                                            // 133
                                                                                            // 134
Tinytest.add("spark - replace tag contents", function (test) {                              // 135
                                                                                            // 136
  // adapted from nateps / metamorph                                                        // 137
                                                                                            // 138
  var do_onscreen = function (f) {                                                          // 139
    var div = OnscreenDiv();                                                                // 140
    var stuff = {                                                                           // 141
      div: div,                                                                             // 142
      node: _.bind(div.node, div),                                                          // 143
      render: function (rfunc) {                                                            // 144
        div.node().appendChild(Meteor.render(rfunc));                                       // 145
      }                                                                                     // 146
    };                                                                                      // 147
                                                                                            // 148
    f.call(stuff);                                                                          // 149
                                                                                            // 150
    div.kill();                                                                             // 151
  };                                                                                        // 152
                                                                                            // 153
  var R, div;                                                                               // 154
                                                                                            // 155
  // basic text replace                                                                     // 156
                                                                                            // 157
  do_onscreen(function () {                                                                 // 158
    R = ReactiveVar("one two three");                                                       // 159
    this.render(function () {                                                               // 160
      return R.get();                                                                       // 161
    });                                                                                     // 162
    R.set("three four five six");                                                           // 163
    Deps.flush();                                                                           // 164
    test.equal(this.div.html(), "three four five six");                                     // 165
  });                                                                                       // 166
                                                                                            // 167
  // work inside a table                                                                    // 168
                                                                                            // 169
  do_onscreen(function () {                                                                 // 170
    R = ReactiveVar("<tr><td>HI!</td></tr>");                                               // 171
    this.render(function () {                                                               // 172
      return "<table id='morphing'>" + R.get() + "</table>";                                // 173
    });                                                                                     // 174
                                                                                            // 175
    test.equal($(this.node()).find("#morphing td").text(), "HI!");                          // 176
    R.set("<tr><td>BUH BYE!</td></tr>");                                                    // 177
    Deps.flush();                                                                           // 178
    test.equal($(this.node()).find("#morphing td").text(), "BUH BYE!");                     // 179
  });                                                                                       // 180
                                                                                            // 181
  // work inside a tbody                                                                    // 182
                                                                                            // 183
  do_onscreen(function () {                                                                 // 184
    R = ReactiveVar("<tr><td>HI!</td></tr>");                                               // 185
    this.render(function () {                                                               // 186
      return "<table id='morphing'><tbody>" + R.get() + "</tbody></table>";                 // 187
    });                                                                                     // 188
                                                                                            // 189
    test.equal($(this.node()).find("#morphing td").text(), "HI!");                          // 190
    R.set("<tr><td>BUH BYE!</td></tr>");                                                    // 191
    Deps.flush();                                                                           // 192
    test.equal($(this.node()).find("#morphing td").text(), "BUH BYE!");                     // 193
  });                                                                                       // 194
                                                                                            // 195
  // work inside a tr                                                                       // 196
                                                                                            // 197
  do_onscreen(function () {                                                                 // 198
    R = ReactiveVar("<td>HI!</td>");                                                        // 199
    this.render(function () {                                                               // 200
      return "<table id='morphing'><tr>" + R.get() + "</tr></table>";                       // 201
    });                                                                                     // 202
                                                                                            // 203
    test.equal($(this.node()).find("#morphing td").text(), "HI!");                          // 204
    R.set("<td>BUH BYE!</td>");                                                             // 205
    Deps.flush();                                                                           // 206
    test.equal($(this.node()).find("#morphing td").text(), "BUH BYE!");                     // 207
  });                                                                                       // 208
                                                                                            // 209
  // work inside a ul                                                                       // 210
                                                                                            // 211
  do_onscreen(function () {                                                                 // 212
    R = ReactiveVar("<li>HI!</li>");                                                        // 213
    this.render(function () {                                                               // 214
      return "<ul id='morphing'>" + R.get() + "</ul>";                                      // 215
    });                                                                                     // 216
                                                                                            // 217
    test.equal($(this.node()).find("#morphing li").text(), "HI!");                          // 218
    R.set("<li>BUH BYE!</li>");                                                             // 219
    Deps.flush();                                                                           // 220
    test.equal($(this.node()).find("#morphing li").text(), "BUH BYE!");                     // 221
  });                                                                                       // 222
                                                                                            // 223
  // work inside a select                                                                   // 224
                                                                                            // 225
  do_onscreen(function () {                                                                 // 226
    R = ReactiveVar("<option>HI!</option>");                                                // 227
    this.render(function () {                                                               // 228
      return "<select id='morphing'>" + R.get() + "</select>";                              // 229
    });                                                                                     // 230
                                                                                            // 231
    test.equal($(this.node()).find("#morphing option").text(), "HI!");                      // 232
    R.set("<option>BUH BYE!</option>");                                                     // 233
    Deps.flush();                                                                           // 234
    test.equal($(this.node()).find("#morphing option").text(), "BUH BYE!");                 // 235
  });                                                                                       // 236
                                                                                            // 237
  // list of select options                                                                 // 238
                                                                                            // 239
  do_onscreen(function () {                                                                 // 240
    var c = new LocalCollection();                                                          // 241
    c.insert({name: 'Hamburger', value: 1});                                                // 242
    c.insert({name: 'Cheeseburger', value: 2});                                             // 243
    this.render(function () {                                                               // 244
      return "<select id='morphing' name='fred'>" +                                         // 245
        Spark.list(c.find({}, {sort: ['value']}), function (doc) {                          // 246
          return '<option value="' + doc.value + '">' + doc.name + '</option>';             // 247
        }) +                                                                                // 248
        "</select>";                                                                        // 249
    });                                                                                     // 250
                                                                                            // 251
    var furtherCanon = function (html) {                                                    // 252
      return html.replace(/\s*selected="selected"/g, '');                                   // 253
    };                                                                                      // 254
                                                                                            // 255
    test.equal(furtherCanon(this.div.html()),                                               // 256
               '<select id="morphing" name="fred">' +                                       // 257
               '<option value="1">Hamburger</option>' +                                     // 258
               '<option value="2">Cheeseburger</option>' +                                  // 259
               '</select>');                                                                // 260
    c.insert({name: 'Chicken Snickers', value: 8});                                         // 261
    Deps.flush();                                                                           // 262
    test.equal(furtherCanon(this.div.html()),                                               // 263
               '<select id="morphing" name="fred">' +                                       // 264
               '<option value="1">Hamburger</option>' +                                     // 265
               '<option value="2">Cheeseburger</option>' +                                  // 266
               '<option value="8">Chicken Snickers</option>' +                              // 267
               '</select>');                                                                // 268
    c.remove({value: 1});                                                                   // 269
    c.remove({value: 2});                                                                   // 270
    Deps.flush();                                                                           // 271
    test.equal(furtherCanon(this.div.html()),                                               // 272
               '<select id="morphing" name="fred">' +                                       // 273
               '<option value="8">Chicken Snickers</option>' +                              // 274
               '</select>');                                                                // 275
    c.remove({});                                                                           // 276
    Deps.flush();                                                                           // 277
    test.equal(furtherCanon(this.div.html()),                                               // 278
               '<select id="morphing" name="fred">' +                                       // 279
               '<!---->' +                                                                  // 280
               '</select>');                                                                // 281
    c.insert({name: 'Hamburger', value: 1});                                                // 282
    c.insert({name: 'Cheeseburger', value: 2});                                             // 283
    Deps.flush();                                                                           // 284
    test.equal(furtherCanon(this.div.html()),                                               // 285
               '<select id="morphing" name="fred">' +                                       // 286
               '<option value="1">Hamburger</option>' +                                     // 287
               '<option value="2">Cheeseburger</option>' +                                  // 288
               '</select>');                                                                // 289
  });                                                                                       // 290
                                                                                            // 291
});                                                                                         // 292
                                                                                            // 293
                                                                                            // 294
Tinytest.add("spark - basic isolate", function (test) {                                     // 295
                                                                                            // 296
  var R = ReactiveVar('foo');                                                               // 297
                                                                                            // 298
  var div = OnscreenDiv(Spark.render(function () {                                          // 299
    return '<div>' + Spark.isolate(function () {                                            // 300
      return '<span>' + R.get() + '</span>';                                                // 301
    }) + '</div>';                                                                          // 302
  }));                                                                                      // 303
                                                                                            // 304
  test.equal(div.html(), '<div><span>foo</span></div>');                                    // 305
  R.set('bar');                                                                             // 306
  test.equal(div.html(), '<div><span>foo</span></div>');                                    // 307
  Deps.flush();                                                                             // 308
  test.equal(div.html(), '<div><span>bar</span></div>');                                    // 309
  R.set('baz');                                                                             // 310
  Deps.flush();                                                                             // 311
  test.equal(div.html(), '<div><span>baz</span></div>');                                    // 312
                                                                                            // 313
  div.kill();                                                                               // 314
  Deps.flush();                                                                             // 315
});                                                                                         // 316
                                                                                            // 317
Tinytest.add("spark - one render", function (test) {                                        // 318
                                                                                            // 319
  var R = ReactiveVar("foo");                                                               // 320
                                                                                            // 321
  var frag = WrappedFrag(Meteor.render(function () {                                        // 322
    return R.get();                                                                         // 323
  })).hold();                                                                               // 324
                                                                                            // 325
  test.equal(R.numListeners(), 1);                                                          // 326
                                                                                            // 327
  // frag should be "foo" initially                                                         // 328
  test.equal(frag.html(), "foo");                                                           // 329
  R.set("bar");                                                                             // 330
  // haven't flushed yet, so update won't have happened                                     // 331
  test.equal(frag.html(), "foo");                                                           // 332
  Deps.flush();                                                                             // 333
  // flushed now, frag should say "bar"                                                     // 334
  test.equal(frag.html(), "bar");                                                           // 335
  frag.release(); // frag is now considered offscreen                                       // 336
  Deps.flush();                                                                             // 337
  R.set("baz");                                                                             // 338
  Deps.flush();                                                                             // 339
  // no update should have happened, offscreen range dep killed                             // 340
  test.equal(frag.html(), "bar");                                                           // 341
                                                                                            // 342
  // should be back to no listeners                                                         // 343
  test.equal(R.numListeners(), 0);                                                          // 344
                                                                                            // 345
  // empty return value should work, and show up as a comment                               // 346
  frag = WrappedFrag(Meteor.render(function () {                                            // 347
    return "";                                                                              // 348
  }));                                                                                      // 349
  test.equal(frag.html(), "<!---->");                                                       // 350
                                                                                            // 351
  // nodes coming and going at top level of fragment                                        // 352
  R.set(true);                                                                              // 353
  frag = WrappedFrag(Meteor.render(function () {                                            // 354
    return R.get() ? "<div>hello</div><div>world</div>" : "";                               // 355
  })).hold();                                                                               // 356
  test.equal(frag.html(), "<div>hello</div><div>world</div>");                              // 357
  R.set(false);                                                                             // 358
  Deps.flush();                                                                             // 359
  test.equal(frag.html(), "<!---->");                                                       // 360
  R.set(true);                                                                              // 361
  Deps.flush();                                                                             // 362
  test.equal(frag.html(), "<div>hello</div><div>world</div>");                              // 363
  test.equal(R.numListeners(), 1);                                                          // 364
  frag.release();                                                                           // 365
  Deps.flush();                                                                             // 366
  test.equal(R.numListeners(), 0);                                                          // 367
                                                                                            // 368
  // more complicated changes                                                               // 369
  R.set(1);                                                                                 // 370
  frag = WrappedFrag(Meteor.render(function () {                                            // 371
    var result = [];                                                                        // 372
    for(var i=0; i<R.get(); i++) {                                                          // 373
      result.push('<div id="x'+i+'" class="foo" name="bar"><p><b>'+                         // 374
                  R.get()+'</b></p></div>');                                                // 375
    }                                                                                       // 376
    return result.join('');                                                                 // 377
  })).hold();                                                                               // 378
  test.equal(frag.html(),                                                                   // 379
               '<div class="foo" id="x0" name="bar"><p><b>1</b></p></div>');                // 380
  R.set(3);                                                                                 // 381
  Deps.flush();                                                                             // 382
  test.equal(frag.html(),                                                                   // 383
               '<div class="foo" id="x0" name="bar"><p><b>3</b></p></div>'+                 // 384
               '<div class="foo" id="x1" name="bar"><p><b>3</b></p></div>'+                 // 385
               '<div class="foo" id="x2" name="bar"><p><b>3</b></p></div>');                // 386
  R.set(2);                                                                                 // 387
  Deps.flush();                                                                             // 388
  test.equal(frag.html(),                                                                   // 389
               '<div class="foo" id="x0" name="bar"><p><b>2</b></p></div>'+                 // 390
               '<div class="foo" id="x1" name="bar"><p><b>2</b></p></div>');                // 391
  frag.release();                                                                           // 392
  Deps.flush();                                                                             // 393
  test.equal(R.numListeners(), 0);                                                          // 394
                                                                                            // 395
  // caller violating preconditions                                                         // 396
  test.equal(WrappedFrag(Meteor.render("foo")).html(), "foo");                              // 397
});                                                                                         // 398
                                                                                            // 399
Tinytest.add("spark - heuristic finalize", function (test) {                                // 400
                                                                                            // 401
  var R = ReactiveVar(123);                                                                 // 402
                                                                                            // 403
  var div = OnscreenDiv(Meteor.render(function () {                                         // 404
    return "<p>The number is "+R.get()+".</p><hr><br><br><u>underlined</u>";                // 405
  }));                                                                                      // 406
                                                                                            // 407
  test.equal(div.html(), "<p>The number is 123.</p><hr><br><br><u>underlined</u>");         // 408
  test.equal(R.numListeners(), 1);                                                          // 409
  Deps.flush();                                                                             // 410
  R.set(456); // won't take effect until flush()                                            // 411
  test.equal(div.html(), "<p>The number is 123.</p><hr><br><br><u>underlined</u>");         // 412
  test.equal(R.numListeners(), 0); // listener already gone                                 // 413
  Deps.flush();                                                                             // 414
  test.equal(div.html(), "<p>The number is 456.</p><hr><br><br><u>underlined</u>");         // 415
  test.equal(R.numListeners(), 1);                                                          // 416
                                                                                            // 417
  div.remove();                                                                             // 418
  R.set(789); // update should force div dependency to be GCed when div is updated          // 419
  Deps.flush();                                                                             // 420
  test.equal(R.numListeners(), 0);                                                          // 421
});                                                                                         // 422
                                                                                            // 423
Tinytest.add("spark - isolate", function (test) {                                           // 424
                                                                                            // 425
  var inc = function (v) {                                                                  // 426
    v.set(v.get() + 1); };                                                                  // 427
                                                                                            // 428
  var R1 = ReactiveVar(0);                                                                  // 429
  var R2 = ReactiveVar(0);                                                                  // 430
  var R3 = ReactiveVar(0);                                                                  // 431
  var count1 = 0, count2 = 0, count3 = 0;                                                   // 432
                                                                                            // 433
  var frag = WrappedFrag(Meteor.render(function () {                                        // 434
    return R1.get() + "," + (count1++) + " " +                                              // 435
      Spark.isolate(function () {                                                           // 436
        return R2.get() + "," + (count2++) + " " +                                          // 437
          Spark.isolate(function () {                                                       // 438
            return R3.get() + "," + (count3++);                                             // 439
          });                                                                               // 440
      });                                                                                   // 441
  })).hold();                                                                               // 442
                                                                                            // 443
  test.equal(frag.html(), "0,0 0,0 0,0");                                                   // 444
                                                                                            // 445
  inc(R1); Deps.flush();                                                                    // 446
  test.equal(frag.html(), "1,1 0,1 0,1");                                                   // 447
                                                                                            // 448
  inc(R2); Deps.flush();                                                                    // 449
  test.equal(frag.html(), "1,1 1,2 0,2");                                                   // 450
                                                                                            // 451
  inc(R3); Deps.flush();                                                                    // 452
  test.equal(frag.html(), "1,1 1,2 1,3");                                                   // 453
                                                                                            // 454
  inc(R2); Deps.flush();                                                                    // 455
  test.equal(frag.html(), "1,1 2,3 1,4");                                                   // 456
                                                                                            // 457
  inc(R1); Deps.flush();                                                                    // 458
  test.equal(frag.html(), "2,2 2,4 1,5");                                                   // 459
                                                                                            // 460
  frag.release();                                                                           // 461
  Deps.flush();                                                                             // 462
  test.equal(R1.numListeners(), 0);                                                         // 463
  test.equal(R2.numListeners(), 0);                                                         // 464
  test.equal(R3.numListeners(), 0);                                                         // 465
                                                                                            // 466
  R1.set(0);                                                                                // 467
  R2.set(0);                                                                                // 468
  R3.set(0);                                                                                // 469
                                                                                            // 470
  frag = WrappedFrag(Meteor.render(function () {                                            // 471
    var buf = [];                                                                           // 472
    buf.push('<div class="foo', R1.get(), '">');                                            // 473
    buf.push(Spark.isolate(function () {                                                    // 474
      var buf = [];                                                                         // 475
      for(var i=0; i<R2.get(); i++) {                                                       // 476
        buf.push(Spark.isolate(function () {                                                // 477
          return '<div>'+R3.get()+'</div>';                                                 // 478
        }));                                                                                // 479
      }                                                                                     // 480
      return buf.join('');                                                                  // 481
    }));                                                                                    // 482
    buf.push('</div>');                                                                     // 483
    return buf.join('');                                                                    // 484
  })).hold();                                                                               // 485
                                                                                            // 486
  test.equal(frag.html(), '<div class="foo0"><!----></div>');                               // 487
  R2.set(3); Deps.flush();                                                                  // 488
  test.equal(frag.html(), '<div class="foo0">'+                                             // 489
               '<div>0</div><div>0</div><div>0</div>'+                                      // 490
               '</div>');                                                                   // 491
                                                                                            // 492
  R3.set(5); Deps.flush();                                                                  // 493
  test.equal(frag.html(), '<div class="foo0">'+                                             // 494
               '<div>5</div><div>5</div><div>5</div>'+                                      // 495
               '</div>');                                                                   // 496
                                                                                            // 497
  R1.set(7); Deps.flush();                                                                  // 498
  test.equal(frag.html(), '<div class="foo7">'+                                             // 499
               '<div>5</div><div>5</div><div>5</div>'+                                      // 500
               '</div>');                                                                   // 501
                                                                                            // 502
  R2.set(1); Deps.flush();                                                                  // 503
  test.equal(frag.html(), '<div class="foo7">'+                                             // 504
               '<div>5</div>'+                                                              // 505
               '</div>');                                                                   // 506
                                                                                            // 507
  R1.set(11); Deps.flush();                                                                 // 508
  test.equal(frag.html(), '<div class="foo11">'+                                            // 509
               '<div>5</div>'+                                                              // 510
               '</div>');                                                                   // 511
                                                                                            // 512
  R2.set(2); Deps.flush();                                                                  // 513
  test.equal(frag.html(), '<div class="foo11">'+                                            // 514
               '<div>5</div><div>5</div>'+                                                  // 515
               '</div>');                                                                   // 516
                                                                                            // 517
  R3.set(4); Deps.flush();                                                                  // 518
  test.equal(frag.html(), '<div class="foo11">'+                                            // 519
               '<div>4</div><div>4</div>'+                                                  // 520
               '</div>');                                                                   // 521
                                                                                            // 522
  frag.release();                                                                           // 523
                                                                                            // 524
  // calling isolate() outside of render mode                                               // 525
  test.equal(Spark.isolate(function () { return "foo"; }), "foo");                          // 526
                                                                                            // 527
  // caller violating preconditions                                                         // 528
                                                                                            // 529
  test.throws(function () {                                                                 // 530
    Meteor.render(function () {                                                             // 531
      return Spark.isolate("foo");                                                          // 532
    });                                                                                     // 533
  });                                                                                       // 534
                                                                                            // 535
                                                                                            // 536
  // unused isolate                                                                         // 537
                                                                                            // 538
  var Q = ReactiveVar("foo");                                                               // 539
  Meteor.render(function () {                                                               // 540
    // create an isolate, in render mode,                                                   // 541
    // but don't use it.                                                                    // 542
    Spark.isolate(function () {                                                             // 543
      return Q.get();                                                                       // 544
    });                                                                                     // 545
    return "";                                                                              // 546
  });                                                                                       // 547
  Q.set("bar");                                                                             // 548
  // might get an error on flush() if implementation                                        // 549
  // deals poorly with unused isolates, or a listener                                       // 550
  // still existing after flush.                                                            // 551
  Deps.flush();                                                                             // 552
  test.equal(Q.numListeners(), 0);                                                          // 553
                                                                                            // 554
  // nesting                                                                                // 555
                                                                                            // 556
  var stuff = ReactiveVar(true);                                                            // 557
  var div = OnscreenDiv(Meteor.render(function () {                                         // 558
    return Spark.isolate(function () {                                                      // 559
      return "x"+(stuff.get() ? 'y' : '') + Spark.isolate(function () {                     // 560
        return "hi";                                                                        // 561
      });                                                                                   // 562
    });                                                                                     // 563
  }));                                                                                      // 564
  test.equal(div.html(), "xyhi");                                                           // 565
  stuff.set(false);                                                                         // 566
  Deps.flush();                                                                             // 567
  test.equal(div.html(), "xhi");                                                            // 568
  div.kill();                                                                               // 569
  Deps.flush();                                                                             // 570
                                                                                            // 571
  // more nesting                                                                           // 572
                                                                                            // 573
  var num1 = ReactiveVar(false);                                                            // 574
  var num2 = ReactiveVar(false);                                                            // 575
  var num3 = ReactiveVar(false);                                                            // 576
  var numset = function (n) {                                                               // 577
    _.each([num1, num2, num3], function (v, i) {                                            // 578
      v.set((i+1) === n);                                                                   // 579
    });                                                                                     // 580
  };                                                                                        // 581
  numset(1);                                                                                // 582
                                                                                            // 583
  var div = OnscreenDiv(Meteor.render(function () {                                         // 584
    return Spark.isolate(function () {                                                      // 585
      return (num1.get() ? '1' : '')+                                                       // 586
        Spark.isolate(function () {                                                         // 587
          return (num2.get() ? '2' : '')+                                                   // 588
            Spark.isolate(function () {                                                     // 589
              return (num3.get() ? '3' : '')+'x';                                           // 590
            });                                                                             // 591
        });                                                                                 // 592
    });                                                                                     // 593
  }));                                                                                      // 594
  test.equal(div.html(), "1x");                                                             // 595
  numset(2);                                                                                // 596
  Deps.flush();                                                                             // 597
  test.equal(div.html(), "2x");                                                             // 598
  numset(3);                                                                                // 599
  Deps.flush();                                                                             // 600
  test.equal(div.html(), "3x");                                                             // 601
  numset(1);                                                                                // 602
  Deps.flush();                                                                             // 603
  test.equal(div.html(), "1x");                                                             // 604
  numset(3);                                                                                // 605
  Deps.flush();                                                                             // 606
  test.equal(div.html(), "3x");                                                             // 607
  numset(2);                                                                                // 608
  Deps.flush();                                                                             // 609
  test.equal(div.html(), "2x");                                                             // 610
  div.remove();                                                                             // 611
  Deps.flush();                                                                             // 612
                                                                                            // 613
  // the real test for slow-path GC finalization:                                           // 614
  num2.set(! num2.get());                                                                   // 615
  Deps.flush();                                                                             // 616
  test.equal(num1.numListeners(), 0);                                                       // 617
  test.equal(num2.numListeners(), 0);                                                       // 618
  test.equal(num3.numListeners(), 0);                                                       // 619
});                                                                                         // 620
                                                                                            // 621
Tinytest.add("spark - data context", function (test) {                                      // 622
  var d1 = {x: 1};                                                                          // 623
  var d2 = {x: 2};                                                                          // 624
  var d3 = {x: 3};                                                                          // 625
  var d4 = {x: 4};                                                                          // 626
  var d5 = {x: 5};                                                                          // 627
                                                                                            // 628
  var traverse = function (frag) {                                                          // 629
    var out = '';                                                                           // 630
    var walkChildren = function (parent) {                                                  // 631
      for (var node = parent.firstChild; node; node = node.nextSibling) {                   // 632
        if (node.nodeType !== 8 /* COMMENT */)  {                                           // 633
          var data = Spark.getDataContext(node);                                            // 634
          out += (data === null) ? "_" : data.x;                                            // 635
        }                                                                                   // 636
        if (node.nodeType === 1 /* ELEMENT */)                                              // 637
          walkChildren(node);                                                               // 638
      }                                                                                     // 639
    };                                                                                      // 640
    walkChildren(frag);                                                                     // 641
    return out;                                                                             // 642
  };                                                                                        // 643
                                                                                            // 644
  var testData = function (serialized, htmlFunc) {                                          // 645
    test.equal(traverse(Spark.render(htmlFunc)), serialized);                               // 646
  };                                                                                        // 647
                                                                                            // 648
  testData("_", function () {                                                               // 649
    return "hi";                                                                            // 650
  });                                                                                       // 651
                                                                                            // 652
  testData("__", function () {                                                              // 653
    return "<div>hi</div>";                                                                 // 654
  });                                                                                       // 655
                                                                                            // 656
  testData("_1", function () {                                                              // 657
    return "<div>" + Spark.setDataContext(d1, "hi") + "</div>";                             // 658
  });                                                                                       // 659
                                                                                            // 660
  testData("21", function () {                                                              // 661
    return Spark.setDataContext(                                                            // 662
      d2, "<div>" + Spark.setDataContext(d1, "hi") + "</div>");                             // 663
  });                                                                                       // 664
                                                                                            // 665
  testData("21", function () {                                                              // 666
    return Spark.setDataContext(                                                            // 667
      d2, "<div>" +                                                                         // 668
        Spark.setDataContext(d3,                                                            // 669
                             Spark.setDataContext(d1, "hi")) +                              // 670
        "</div>");                                                                          // 671
  });                                                                                       // 672
                                                                                            // 673
  testData("23", function () {                                                              // 674
    return Spark.setDataContext(                                                            // 675
      d2, "<div>" +                                                                         // 676
        Spark.setDataContext(d1,                                                            // 677
                             Spark.setDataContext(d3, "hi")) +                              // 678
        "</div>");                                                                          // 679
  });                                                                                       // 680
                                                                                            // 681
  testData("23", function () {                                                              // 682
    var html = Spark.setDataContext(                                                        // 683
      d2, "<div>" +                                                                         // 684
        Spark.setDataContext(d1,                                                            // 685
                             Spark.setDataContext(d3, "hi")) +                              // 686
        "</div>");                                                                          // 687
    return Spark.setDataContext(d4, html);                                                  // 688
  });                                                                                       // 689
                                                                                            // 690
  testData("1_2", function () {                                                             // 691
    return Spark.setDataContext(d1, "hi") + "-" +                                           // 692
      Spark.setDataContext(d2, "there");                                                    // 693
  });                                                                                       // 694
                                                                                            // 695
  testData("_122_3__45", function () {                                                      // 696
    return "<div>" +                                                                        // 697
      Spark.setDataContext(d1, "<div></div>") +                                             // 698
      Spark.setDataContext(d2, "<div><div></div></div>") +                                  // 699
      "<div></div>" +                                                                       // 700
      Spark.setDataContext(d3, "<div></div>") +                                             // 701
      "<div><div></div></div>" +                                                            // 702
      Spark.setDataContext(d4, "<div>" +                                                    // 703
                           Spark.setDataContext(d5, "<div></div>") +                        // 704
                           "</div>");                                                       // 705
  });                                                                                       // 706
});                                                                                         // 707
                                                                                            // 708
Tinytest.add("spark - tables", function (test) {                                            // 709
  var R = ReactiveVar(0);                                                                   // 710
                                                                                            // 711
  var table = OnscreenDiv(Meteor.render(function () {                                       // 712
    var buf = [];                                                                           // 713
    buf.push("<table>");                                                                    // 714
    for(var i=0; i<R.get(); i++)                                                            // 715
      buf.push("<tr><td>"+(i+1)+"</td></tr>");                                              // 716
    buf.push("</table>");                                                                   // 717
    return buf.join('');                                                                    // 718
  }));                                                                                      // 719
                                                                                            // 720
  R.set(1);                                                                                 // 721
  Deps.flush();                                                                             // 722
  test.equal(table.html(), "<table><tbody><tr><td>1</td></tr></tbody></table>");            // 723
                                                                                            // 724
  R.set(10);                                                                                // 725
  test.equal(table.html(), "<table><tbody><tr><td>1</td></tr></tbody></table>");            // 726
  Deps.flush();                                                                             // 727
  test.equal(table.html(), "<table><tbody>"+                                                // 728
               "<tr><td>1</td></tr>"+                                                       // 729
               "<tr><td>2</td></tr>"+                                                       // 730
               "<tr><td>3</td></tr>"+                                                       // 731
               "<tr><td>4</td></tr>"+                                                       // 732
               "<tr><td>5</td></tr>"+                                                       // 733
               "<tr><td>6</td></tr>"+                                                       // 734
               "<tr><td>7</td></tr>"+                                                       // 735
               "<tr><td>8</td></tr>"+                                                       // 736
               "<tr><td>9</td></tr>"+                                                       // 737
               "<tr><td>10</td></tr>"+                                                      // 738
               "</tbody></table>");                                                         // 739
                                                                                            // 740
  R.set(0);                                                                                 // 741
  Deps.flush();                                                                             // 742
  test.equal(table.html(), "<table></table>");                                              // 743
  table.kill();                                                                             // 744
  Deps.flush();                                                                             // 745
  test.equal(R.numListeners(), 0);                                                          // 746
                                                                                            // 747
  var div = OnscreenDiv();                                                                  // 748
  div.node().appendChild(document.createElement("TABLE"));                                  // 749
  div.node().firstChild.appendChild(Meteor.render(function () {                             // 750
    var buf = [];                                                                           // 751
    for(var i=0; i<R.get(); i++)                                                            // 752
      buf.push("<tr><td>"+(i+1)+"</td></tr>");                                              // 753
    return buf.join('');                                                                    // 754
  }));                                                                                      // 755
  test.equal(div.html(), "<table><!----></table>");                                         // 756
  R.set(3);                                                                                 // 757
  Deps.flush();                                                                             // 758
  test.equal(div.html(), "<table><tbody>"+                                                  // 759
               "<tr><td>1</td></tr>"+                                                       // 760
               "<tr><td>2</td></tr>"+                                                       // 761
               "<tr><td>3</td></tr>"+                                                       // 762
               "</tbody></table>");                                                         // 763
  test.equal(div.node().firstChild.rows.length, 3);                                         // 764
  R.set(0);                                                                                 // 765
  Deps.flush();                                                                             // 766
  test.equal(div.html(), "<table><!----></table>");                                         // 767
  div.kill();                                                                               // 768
  Deps.flush();                                                                             // 769
                                                                                            // 770
  test.equal(R.numListeners(), 0);                                                          // 771
                                                                                            // 772
  div = OnscreenDiv();                                                                      // 773
  div.node().appendChild(DomUtils.htmlToFragment("<table><tr></tr></table>"));              // 774
  R.set(3);                                                                                 // 775
  div.node().getElementsByTagName("tr")[0].appendChild(Meteor.render(                       // 776
    function () {                                                                           // 777
      var buf = [];                                                                         // 778
      for(var i=0; i<R.get(); i++)                                                          // 779
        buf.push("<td>"+(i+1)+"</td>");                                                     // 780
      return buf.join('');                                                                  // 781
    }));                                                                                    // 782
  test.equal(div.html(),                                                                    // 783
               "<table><tbody><tr><td>1</td><td>2</td><td>3</td>"+                          // 784
               "</tr></tbody></table>");                                                    // 785
  R.set(1);                                                                                 // 786
  Deps.flush();                                                                             // 787
  test.equal(div.html(),                                                                    // 788
               "<table><tbody><tr><td>1</td></tr></tbody></table>");                        // 789
  div.kill();                                                                               // 790
  Deps.flush();                                                                             // 791
  test.equal(R.numListeners(), 0);                                                          // 792
                                                                                            // 793
  div = OnscreenDiv(renderWithPreservation(function() {                                     // 794
    return '<table id="my-awesome-table">'+R.get()+'</table>';                              // 795
  }));                                                                                      // 796
  Deps.flush();                                                                             // 797
  R.set("<tr><td>Hello</td></tr>");                                                         // 798
  Deps.flush();                                                                             // 799
  test.equal(                                                                               // 800
    div.html(),                                                                             // 801
    '<table id="my-awesome-table"><tbody><tr><td>Hello</td></tr></tbody></table>');         // 802
  div.kill();                                                                               // 803
  Deps.flush();                                                                             // 804
                                                                                            // 805
  test.equal(R.numListeners(), 0);                                                          // 806
});                                                                                         // 807
                                                                                            // 808
Tinytest.add("spark - event handling", function (test) {                                    // 809
  var event_buf = [];                                                                       // 810
  var getid = function (id) {                                                               // 811
    return document.getElementById(id);                                                     // 812
  };                                                                                        // 813
                                                                                            // 814
  var div;                                                                                  // 815
                                                                                            // 816
  var chunk = function (htmlFunc, options) {                                                // 817
    var html = Spark.isolate(htmlFunc);                                                     // 818
    options = options || {};                                                                // 819
    if (options.events)                                                                     // 820
      html = Spark.attachEvents(options.events, html);                                      // 821
    if (options.event_data)                                                                 // 822
      html = Spark.setDataContext(options.event_data, html);                                // 823
    return html;                                                                            // 824
  };                                                                                        // 825
                                                                                            // 826
  var render = function (htmlFunc, options) {                                               // 827
    return Spark.render(function () {                                                       // 828
      return chunk(htmlFunc, options);                                                      // 829
    });                                                                                     // 830
  };                                                                                        // 831
                                                                                            // 832
                                                                                            // 833
  // clicking on a div at top level                                                         // 834
  event_buf.length = 0;                                                                     // 835
  div = OnscreenDiv(render(function () {                                                    // 836
    return '<div id="foozy">Foo</div>';                                                     // 837
  }, {events: eventmap("click"), event_data:event_buf}));                                   // 838
  clickElement(getid("foozy"));                                                             // 839
  test.equal(event_buf, ['click']);                                                         // 840
  div.kill();                                                                               // 841
  Deps.flush();                                                                             // 842
                                                                                            // 843
  // selector that specifies a top-level div                                                // 844
  event_buf.length = 0;                                                                     // 845
  div = OnscreenDiv(render(function () {                                                    // 846
    return '<div id="foozy">Foo</div>';                                                     // 847
  }, {events: eventmap("click div"), event_data:event_buf}));                               // 848
  clickElement(getid("foozy"));                                                             // 849
  test.equal(event_buf, ['click div']);                                                     // 850
  div.kill();                                                                               // 851
  Deps.flush();                                                                             // 852
                                                                                            // 853
  // selector that specifies a second-level span                                            // 854
  event_buf.length = 0;                                                                     // 855
  div = OnscreenDiv(render(function () {                                                    // 856
    return '<div id="foozy"><span>Foo</span></div>';                                        // 857
  }, {events: eventmap("click span"), event_data:event_buf}));                              // 858
  clickElement(getid("foozy").firstChild);                                                  // 859
  test.equal(event_buf, ['click span']);                                                    // 860
  div.kill();                                                                               // 861
  Deps.flush();                                                                             // 862
                                                                                            // 863
  // replaced top-level elements still have event handlers                                  // 864
  // even if replaced by an isolate above the handlers in the DOM                           // 865
  var R = ReactiveVar("p");                                                                 // 866
  event_buf.length = 0;                                                                     // 867
  div = OnscreenDiv(render(function () {                                                    // 868
    return chunk(function () {                                                              // 869
      return '<'+R.get()+' id="foozy">Hello</'+R.get()+'>';                                 // 870
    });                                                                                     // 871
  }, {events: eventmap("click"), event_data:event_buf}));                                   // 872
  clickElement(getid("foozy"));                                                             // 873
  test.equal(event_buf, ['click']);                                                         // 874
  event_buf.length = 0;                                                                     // 875
  R.set("div"); // change tag, which is sure to replace element                             // 876
  Deps.flush();                                                                             // 877
  clickElement(getid("foozy")); // still clickable?                                         // 878
  test.equal(event_buf, ['click']);                                                         // 879
  event_buf.length = 0;                                                                     // 880
  R.set("p");                                                                               // 881
  Deps.flush();                                                                             // 882
  clickElement(getid("foozy"));                                                             // 883
  test.equal(event_buf, ['click']);                                                         // 884
  event_buf.length = 0;                                                                     // 885
  div.kill();                                                                               // 886
  Deps.flush();                                                                             // 887
                                                                                            // 888
  // bubbling from event on descendent of element matched                                   // 889
  // by selector                                                                            // 890
  event_buf.length = 0;                                                                     // 891
  div = OnscreenDiv(render(function () {                                                    // 892
    return '<div id="foozy"><span><u><b>Foo</b></u></span>'+                                // 893
      '<span>Bar</span></div>';                                                             // 894
  }, {events: eventmap("click span"), event_data:event_buf}));                              // 895
  clickElement(                                                                             // 896
    getid("foozy").firstChild.firstChild.firstChild);                                       // 897
  test.equal(event_buf, ['click span']);                                                    // 898
  div.kill();                                                                               // 899
  Deps.flush();                                                                             // 900
                                                                                            // 901
  // bubbling order (for same event, same render node, different selector nodes)            // 902
  event_buf.length = 0;                                                                     // 903
  div = OnscreenDiv(render(function () {                                                    // 904
    return '<div id="foozy"><span><u><b>Foo</b></u></span>'+                                // 905
      '<span>Bar</span></div>';                                                             // 906
  }, {events: eventmap("click span", "click b"), event_data:event_buf}));                   // 907
  clickElement(                                                                             // 908
    getid("foozy").firstChild.firstChild.firstChild);                                       // 909
  test.equal(event_buf, ['click b', 'click span']);                                         // 910
  div.kill();                                                                               // 911
  Deps.flush();                                                                             // 912
                                                                                            // 913
  // "bubbling" order for handlers at same level                                            // 914
  event_buf.length = 0;                                                                     // 915
  div = OnscreenDiv(render(function () {                                                    // 916
    return chunk(function () {                                                              // 917
      return chunk(function () {                                                            // 918
        return '<span id="foozy" class="a b c">Hello</span>';                               // 919
      }, {events: eventmap("click .c"), event_data:event_buf});                             // 920
    }, {events: eventmap("click .b"), event_data:event_buf});                               // 921
  }, {events: eventmap("click .a"), event_data:event_buf}));                                // 922
  clickElement(getid("foozy"));                                                             // 923
  test.equal(event_buf, ['click .c', 'click .b', 'click .a']);                              // 924
  event_buf.length = 0;                                                                     // 925
  div.kill();                                                                               // 926
  Deps.flush();                                                                             // 927
                                                                                            // 928
  // stopPropagation doesn't prevent other event maps from                                  // 929
  // handling same node                                                                     // 930
  event_buf.length = 0;                                                                     // 931
  div = OnscreenDiv(render(function () {                                                    // 932
    return chunk(function () {                                                              // 933
      return chunk(function () {                                                            // 934
        return '<span id="foozy" class="a b c">Hello</span>';                               // 935
      }, {events: eventmap("click .c"), event_data:event_buf});                             // 936
    }, {events: {"click .b": function (evt) {                                               // 937
      event_buf.push("click .b"); evt.stopPropagation();}}});                               // 938
  }, {events: eventmap("click .a"), event_data:event_buf}));                                // 939
  clickElement(getid("foozy"));                                                             // 940
  test.equal(event_buf, ['click .c', 'click .b', 'click .a']);                              // 941
  event_buf.length = 0;                                                                     // 942
  div.kill();                                                                               // 943
  Deps.flush();                                                                             // 944
                                                                                            // 945
  // stopImmediatePropagation DOES                                                          // 946
  event_buf.length = 0;                                                                     // 947
  div = OnscreenDiv(render(function () {                                                    // 948
    return chunk(function () {                                                              // 949
      return chunk(function () {                                                            // 950
        return '<span id="foozy" class="a b c">Hello</span>';                               // 951
      }, {events: eventmap("click .c"), event_data:event_buf});                             // 952
    }, {events: {"click .b": function (evt) {                                               // 953
      event_buf.push("click .b");                                                           // 954
      evt.stopImmediatePropagation();}}});                                                  // 955
  }, {events: eventmap("click .a"), event_data:event_buf}));                                // 956
  clickElement(getid("foozy"));                                                             // 957
  test.equal(event_buf, ['click .c', 'click .b']);                                          // 958
  event_buf.length = 0;                                                                     // 959
  div.kill();                                                                               // 960
  Deps.flush();                                                                             // 961
                                                                                            // 962
  // bubbling continues even with DOM change                                                // 963
  event_buf.length = 0;                                                                     // 964
  R = ReactiveVar(true);                                                                    // 965
  div = OnscreenDiv(render(function () {                                                    // 966
    return chunk(function () {                                                              // 967
      return '<div id="blarn">'+(R.get()?'<span id="foozy">abcd</span>':'')+'</div>';       // 968
    }, {events: { 'click span': function () {                                               // 969
      event_buf.push('click span');                                                         // 970
      R.set(false);                                                                         // 971
      Deps.flush(); // kill the span                                                        // 972
    }, 'click div': function (evt) {                                                        // 973
      event_buf.push('click div');                                                          // 974
    }}});                                                                                   // 975
  }));                                                                                      // 976
  // click on span                                                                          // 977
  clickElement(getid("foozy"));                                                             // 978
  test.expect_fail(); // doesn't seem to work in old IE                                     // 979
  test.equal(event_buf, ['click span', 'click div']);                                       // 980
  event_buf.length = 0;                                                                     // 981
  div.kill();                                                                               // 982
  Deps.flush();                                                                             // 983
                                                                                            // 984
  // "deep reach" from high node down to replaced low node.                                 // 985
  // Tests that events are registered correctly to work in                                  // 986
  // old IE.  Also tests change event bubbling                                              // 987
  // and proper interpretation of event maps.                                               // 988
  event_buf.length = 0;                                                                     // 989
  R = ReactiveVar('foo');                                                                   // 990
  div = OnscreenDiv(render(function () {                                                    // 991
    return '<div><p><span><b>'+                                                             // 992
      chunk(function () {                                                                   // 993
        return '<input type="checkbox">'+R.get();                                           // 994
      }, {events: eventmap('click input'), event_data:event_buf}) +                         // 995
      '</b></span></p></div>';                                                              // 996
  }, { events: eventmap('change b', 'change input'), event_data:event_buf }));              // 997
  R.set('bar');                                                                             // 998
  Deps.flush();                                                                             // 999
  // click on input                                                                         // 1000
  clickElement(div.node().getElementsByTagName('input')[0]);                                // 1001
  event_buf.sort(); // don't care about order                                               // 1002
  test.equal(event_buf, ['change b', 'change input', 'click input']);                       // 1003
  event_buf.length = 0;                                                                     // 1004
  div.kill();                                                                               // 1005
  Deps.flush();                                                                             // 1006
                                                                                            // 1007
  // test that 'click *' fires on bubble                                                    // 1008
  event_buf.length = 0;                                                                     // 1009
  R = ReactiveVar('foo');                                                                   // 1010
  div = OnscreenDiv(render(function () {                                                    // 1011
    return '<div><p><span><b>'+                                                             // 1012
      chunk(function () {                                                                   // 1013
        return '<input type="checkbox">'+R.get();                                           // 1014
      }, {events: eventmap('click input'), event_data:event_buf}) +                         // 1015
      '</b></span></p></div>';                                                              // 1016
  }, { events: eventmap('click *'), event_data:event_buf }));                               // 1017
  R.set('bar');                                                                             // 1018
  Deps.flush();                                                                             // 1019
  // click on input                                                                         // 1020
  clickElement(div.node().getElementsByTagName('input')[0]);                                // 1021
  test.equal(                                                                               // 1022
    event_buf,                                                                              // 1023
    ['click input', 'click *', 'click *', 'click *', 'click *', 'click *']);                // 1024
  event_buf.length = 0;                                                                     // 1025
  div.kill();                                                                               // 1026
  Deps.flush();                                                                             // 1027
                                                                                            // 1028
  // clicking on a div in a nested chunk (without patching)                                 // 1029
  event_buf.length = 0;                                                                     // 1030
  R = ReactiveVar('foo');                                                                   // 1031
  div = OnscreenDiv(render(function () {                                                    // 1032
    return R.get() + chunk(function () {                                                    // 1033
      return '<span>ism</span>';                                                            // 1034
    }, {events: eventmap("click"), event_data:event_buf});                                  // 1035
  }));                                                                                      // 1036
  test.equal(div.text(), 'fooism');                                                         // 1037
  clickElement(div.node().getElementsByTagName('SPAN')[0]);                                 // 1038
  test.equal(event_buf, ['click']);                                                         // 1039
  event_buf.length = 0;                                                                     // 1040
  R.set('bar');                                                                             // 1041
  Deps.flush();                                                                             // 1042
  test.equal(div.text(), 'barism');                                                         // 1043
  clickElement(div.node().getElementsByTagName('SPAN')[0]);                                 // 1044
  test.equal(event_buf, ['click']);                                                         // 1045
  event_buf.length = 0;                                                                     // 1046
  div.kill();                                                                               // 1047
  Deps.flush();                                                                             // 1048
                                                                                            // 1049
  // Test that reactive fragments manually inserted inside                                  // 1050
  // a reactive fragment eventually get wired.                                              // 1051
  event_buf.length = 0;                                                                     // 1052
  div = OnscreenDiv(render(function () {                                                    // 1053
    return "<div></div>";                                                                   // 1054
  }, { events: eventmap("click span", event_buf) }));                                       // 1055
  Deps.flush();                                                                             // 1056
  div.node().firstChild.appendChild(render(function () {                                    // 1057
    return '<span id="foozy">hello</span>';                                                 // 1058
  }));                                                                                      // 1059
  clickElement(getid("foozy"));                                                             // 1060
  // implementation has no way to know we've inserted the fragment                          // 1061
  test.equal(event_buf, []);                                                                // 1062
  event_buf.length = 0;                                                                     // 1063
  Deps.flush();                                                                             // 1064
  clickElement(getid("foozy"));                                                             // 1065
  // now should be wired up                                                                 // 1066
  test.equal(event_buf, ['click span']);                                                    // 1067
  event_buf.length = 0;                                                                     // 1068
  div.kill();                                                                               // 1069
  Deps.flush();                                                                             // 1070
                                                                                            // 1071
  // Event data comes from event.currentTarget, not event.target                            // 1072
  var data_buf = [];                                                                        // 1073
  div = OnscreenDiv(render(function () {                                                    // 1074
    return "<ul>"+chunk(function () {                                                       // 1075
      return '<li id="funyard">Hello</li>';                                                 // 1076
    }, { event_data: {x:'listuff'} })+"</ul>";                                              // 1077
  }, { event_data: {x:'ulstuff'},                                                           // 1078
       events: { 'click ul': function () { data_buf.push(this); }}}));                      // 1079
  clickElement(getid("funyard"));                                                           // 1080
  test.equal(data_buf, [{x:'ulstuff'}]);                                                    // 1081
  div.kill();                                                                               // 1082
  Deps.flush();                                                                             // 1083
});                                                                                         // 1084
                                                                                            // 1085
                                                                                            // 1086
Tinytest.add("spark - list event handling", function(test) {                                // 1087
  var event_buf = [];                                                                       // 1088
  var div;                                                                                  // 1089
                                                                                            // 1090
  // same thing, but with events wired by listChunk "added" and "removed"                   // 1091
  event_buf.length = 0;                                                                     // 1092
  var lst = [];                                                                             // 1093
  lst.observeChanges = function(callbacks) {                                                // 1094
    lst.callbacks = callbacks;                                                              // 1095
    return {                                                                                // 1096
      stop: function() {                                                                    // 1097
        lst.callbacks = null;                                                               // 1098
      }                                                                                     // 1099
    };                                                                                      // 1100
  };                                                                                        // 1101
  div = OnscreenDiv(Meteor.render(function() {                                              // 1102
    var chkbx = function(doc) {                                                             // 1103
      return '<input type="checkbox">'+(doc ? doc._id : 'else');                            // 1104
    };                                                                                      // 1105
    var html = '<div><p><span><b>' +                                                        // 1106
      Spark.setDataContext(                                                                 // 1107
        event_buf, Spark.attachEvents(                                                      // 1108
          eventmap('click input', event_buf), Spark.list(lst, chkbx, chkbx))) +             // 1109
      '</b></span></p></div>';                                                              // 1110
    html = Spark.setDataContext(event_buf, html);                                           // 1111
    html = Spark.attachEvents(eventmap('change b', 'change input', event_buf),              // 1112
                              html);                                                        // 1113
    return html;                                                                            // 1114
  }));                                                                                      // 1115
  Deps.flush();                                                                             // 1116
  test.equal(div.text().match(/\S+/)[0], 'else');                                           // 1117
  // click on input                                                                         // 1118
  var doClick = function() {                                                                // 1119
    clickElement(div.node().getElementsByTagName('input')[0]);                              // 1120
    event_buf.sort(); // don't care about order                                             // 1121
    test.equal(event_buf, ['change b', 'change input', 'click input']);                     // 1122
    event_buf.length = 0;                                                                   // 1123
  };                                                                                        // 1124
  doClick();                                                                                // 1125
  // add item                                                                               // 1126
  lst.push({_id:'foo'});                                                                    // 1127
  lst.callbacks.addedBefore(lst[0]._id, lst[0], null);                                      // 1128
  Deps.flush();                                                                             // 1129
  test.equal(div.text().match(/\S+/)[0], 'foo');                                            // 1130
  doClick();                                                                                // 1131
  // remove item, back to "else" case                                                       // 1132
  lst.callbacks.removed(lst[0]._id);                                                        // 1133
  lst.pop();                                                                                // 1134
  Deps.flush();                                                                             // 1135
  test.equal(div.text().match(/\S+/)[0], 'else');                                           // 1136
  doClick();                                                                                // 1137
  // cleanup                                                                                // 1138
  div.kill();                                                                               // 1139
  Deps.flush();                                                                             // 1140
                                                                                            // 1141
});                                                                                         // 1142
                                                                                            // 1143
                                                                                            // 1144
Tinytest.add("spark - basic landmarks", function (test) {                                   // 1145
  var R = ReactiveVar("111");                                                               // 1146
  var x = [];                                                                               // 1147
  var expect = function (what) {                                                            // 1148
    test.equal(x, what);                                                                    // 1149
    x = [];                                                                                 // 1150
  };                                                                                        // 1151
                                                                                            // 1152
  var X = {};                                                                               // 1153
                                                                                            // 1154
  var div = OnscreenDiv(Spark.render(function () {                                          // 1155
    return Spark.isolate(function () {                                                      // 1156
      return R.get() +                                                                      // 1157
        Spark.createLandmark({                                                              // 1158
          created: function () {                                                            // 1159
            x.push("c");                                                                    // 1160
            this.a = X;                                                                     // 1161
          },                                                                                // 1162
          rendered: function () {                                                           // 1163
            x.push("r", this.a);                                                            // 1164
          },                                                                                // 1165
          destroyed: function () {                                                          // 1166
            x.push("d", this.a);                                                            // 1167
          }                                                                                 // 1168
        }, function() { return "hi"; });                                                    // 1169
    });                                                                                     // 1170
  }));                                                                                      // 1171
                                                                                            // 1172
  expect(["c"]);                                                                            // 1173
  Deps.flush();                                                                             // 1174
  expect(["r", X]);                                                                         // 1175
  Deps.flush();                                                                             // 1176
  expect([]);                                                                               // 1177
  R.set("222");                                                                             // 1178
  expect([]);                                                                               // 1179
  Deps.flush();                                                                             // 1180
  expect(["r", X]);                                                                         // 1181
  Deps.flush();                                                                             // 1182
  expect([]);                                                                               // 1183
  div.remove();                                                                             // 1184
  expect([]);                                                                               // 1185
  Deps.flush();                                                                             // 1186
  expect([]);                                                                               // 1187
  div.kill();                                                                               // 1188
  Deps.flush();                                                                             // 1189
  expect(["d", X]);                                                                         // 1190
});                                                                                         // 1191
                                                                                            // 1192
Tinytest.add("spark - labeled landmarks", function (test) {                                 // 1193
  var R = [];                                                                               // 1194
  for (var i = 0; i < 10; i++)                                                              // 1195
    R.push(ReactiveVar(""));                                                                // 1196
                                                                                            // 1197
  var x = [];                                                                               // 1198
  var s = [];                                                                               // 1199
  var expect = function (what_x, what_s) {                                                  // 1200
    test.equal(x, what_x);                                                                  // 1201
    test.equal(s, what_s);                                                                  // 1202
    x = [];                                                                                 // 1203
    s = [];                                                                                 // 1204
  };                                                                                        // 1205
                                                                                            // 1206
  var excludeLandmarks = [];                                                                // 1207
  for (var i = 0; i < 6; i++)                                                               // 1208
    excludeLandmarks.push(ReactiveVar(false));                                              // 1209
                                                                                            // 1210
  var isolateLandmarks = ReactiveVar(false);                                                // 1211
  var serial = 1;                                                                           // 1212
  var testLandmark = function (id, htmlFunc) {                                              // 1213
    if (excludeLandmarks[id].get())                                                         // 1214
      return "";                                                                            // 1215
                                                                                            // 1216
    var f = function () {                                                                   // 1217
      var thisSerial = serial++;                                                            // 1218
                                                                                            // 1219
      return Spark.createLandmark({                                                         // 1220
        created: function () {                                                              // 1221
          x.push("c", id);                                                                  // 1222
          s.push(thisSerial);                                                               // 1223
          this.id = id;                                                                     // 1224
        },                                                                                  // 1225
        rendered: function () {                                                             // 1226
          x.push("r", id);                                                                  // 1227
          s.push(thisSerial);                                                               // 1228
          test.equal(this.id, id);                                                          // 1229
        },                                                                                  // 1230
        destroyed: function () {                                                            // 1231
          x.push("d", id);                                                                  // 1232
          s.push(thisSerial);                                                               // 1233
          test.equal(this.id, id);                                                          // 1234
        }                                                                                   // 1235
      }, htmlFunc);                                                                         // 1236
    };                                                                                      // 1237
                                                                                            // 1238
    if (isolateLandmarks.get())                                                             // 1239
      return Spark.isolate(function () { return f(); });                                    // 1240
    else                                                                                    // 1241
      return f();                                                                           // 1242
  };                                                                                        // 1243
                                                                                            // 1244
  var label = Spark.labelBranch;                                                            // 1245
                                                                                            // 1246
  var dep = function (i) {                                                                  // 1247
    return R[i].get();                                                                      // 1248
  };                                                                                        // 1249
                                                                                            // 1250
  // this frog is pretty well boiled                                                        // 1251
  var div = OnscreenDiv(Spark.render(function () {                                          // 1252
    var html = Spark.isolate(function () {                                                  // 1253
      return (                                                                              // 1254
        dep(0) +                                                                            // 1255
          testLandmark(1, function () {return "hi" + dep(1); }) +                           // 1256
          label("a", function () {                                                          // 1257
            return dep(2) +                                                                 // 1258
              testLandmark(2, function () { return "hi" + dep(3);});}) +                    // 1259
          label("b", function () {                                                          // 1260
            return dep(4) +                                                                 // 1261
              testLandmark(3, function () {                                                 // 1262
                return "hi" + dep(5) +                                                                     label("c", function () {
                  return dep(6) +                                                           // 1264
                    testLandmark(4, function () {                                           // 1265
                      return "hi" + dep(7) +                                                // 1266
                        label("d", function () {                                            // 1267
                          return label("e", function () {                                   // 1268
                            return dep(8) +                                                 // 1269
                              label("f", function () {                                      // 1270
                                return testLandmark(                                        // 1271
                                  5, function () { return "hi" + dep(9);}                   // 1272
                                );});});});});});});}));                                    // 1273
    });                                                                                     // 1274
    return html;                                                                            // 1275
  }));                                                                                      // 1276
                                                                                            // 1277
  // callback order is not specced                                                          // 1278
  expect(["c", 1, "c", 2, "c", 3, "c", 4, "c", 5], [1, 2, 3, 4, 5]);                        // 1279
  Deps.flush();                                                                             // 1280
  expect(["r", 1, "r", 2, "r", 5, "r", 4, "r", 3], [1, 2, 5, 4, 3]);                        // 1281
  for (var i = 0; i < 10; i++) {                                                            // 1282
    R[i].set(1);                                                                            // 1283
    expect([], []);                                                                         // 1284
    Deps.flush();                                                                           // 1285
    expect(["r", 1, "r", 2, "r", 5, "r", 4, "r", 3],                                        // 1286
           [i*5 + 6, i*5 + 7, i*5 + 10, i*5 + 9, i*5 + 8]);                                 // 1287
  };                                                                                        // 1288
                                                                                            // 1289
  excludeLandmarks[2].set(true);                                                            // 1290
  expect([], []);                                                                           // 1291
  Deps.flush();                                                                             // 1292
  expect(["d", 2, "r", 1, "r", 5, "r", 4, "r", 3],                                          // 1293
         [52, 56, 59, 58, 57]);                                                             // 1294
                                                                                            // 1295
  excludeLandmarks[2].set(false);                                                           // 1296
  excludeLandmarks[3].set(true);                                                            // 1297
  expect([], []);                                                                           // 1298
  Deps.flush();                                                                             // 1299
  expect(["c", 2, "d", 3, "d", 4, "d", 5, "r", 1, "r", 2],                                  // 1300
         [61, 57, 58, 59, 60, 61]);                                                         // 1301
                                                                                            // 1302
  excludeLandmarks[2].set(true);                                                            // 1303
  excludeLandmarks[3].set(false);                                                           // 1304
  expect([], []);                                                                           // 1305
  Deps.flush();                                                                             // 1306
  expect(["c", 3, "c", 4, "c", 5, "d", 2, "r", 1, "r", 5, "r", 4, "r", 3],                  // 1307
         [63, 64, 65, 61, 62, 65, 64, 63]);                                                 // 1308
                                                                                            // 1309
  excludeLandmarks[2].set(false);                                                           // 1310
  expect([], []);                                                                           // 1311
  Deps.flush();                                                                             // 1312
  expect(["c", 2, "r", 1, "r", 2, "r", 5, "r", 4, "r", 3],                                  // 1313
         [67, 66, 67, 70, 69, 68]);                                                         // 1314
                                                                                            // 1315
  isolateLandmarks.set(true);                                                               // 1316
  expect([], []);                                                                           // 1317
  Deps.flush();                                                                             // 1318
  expect(["r", 1, "r", 2, "r", 5, "r", 4, "r", 3],                                          // 1319
         [71, 72, 75, 74, 73]);                                                             // 1320
                                                                                            // 1321
  for (var i = 0; i < 10; i++) {                                                            // 1322
    var expected = [                                                                        // 1323
      [["r", 1, "r", 2, "r", 5, "r", 4, "r", 3], [76, 77, 80, 79, 78]],                     // 1324
      [["r", 1], [81]],                                                                     // 1325
      [["r", 1, "r", 2, "r", 5, "r", 4, "r", 3], [82, 83, 86, 85, 84]],                     // 1326
      [["r", 2], [87]],                                                                     // 1327
      [["r", 1, "r", 2, "r", 5, "r", 4, "r", 3], [88, 89, 92, 91, 90]],                     // 1328
      [["r", 5, "r", 4, "r", 3], [95, 94, 93]],                                             // 1329
      [["r", 5, "r", 4, "r", 3], [98, 97, 96]],                                             // 1330
      [["r", 5, "r", 4, "r", 3], [100, 99, 96]],                                            // 1331
      [["r", 5, "r", 4, "r", 3], [102, 101, 96]],                                           // 1332
      [["r", 5, "r", 4, "r", 3], [103, 101, 96]]                                            // 1333
    ][i];                                                                                   // 1334
    R[i].set(2);                                                                            // 1335
    expect([], []);                                                                         // 1336
    Deps.flush();                                                                           // 1337
    expect.apply(null, expected);                                                           // 1338
  };                                                                                        // 1339
                                                                                            // 1340
  excludeLandmarks[4].set(true);                                                            // 1341
  Deps.flush();                                                                             // 1342
  expect(["d", 4, "d", 5, "r", 3], [101, 103, 104]);                                        // 1343
                                                                                            // 1344
  excludeLandmarks[4].set(false);                                                           // 1345
  excludeLandmarks[5].set(true);                                                            // 1346
  Deps.flush();                                                                             // 1347
  expect(["c", 4, "r", 4, "r", 3], [106, 106, 105]);                                        // 1348
                                                                                            // 1349
  excludeLandmarks[5].set(false);                                                           // 1350
  Deps.flush();                                                                             // 1351
  expect(["c", 5, "r", 5, "r", 4, "r", 3], [108, 108, 107, 105]);                           // 1352
                                                                                            // 1353
  div.kill();                                                                               // 1354
  Deps.flush();                                                                             // 1355
});                                                                                         // 1356
                                                                                            // 1357
                                                                                            // 1358
Tinytest.add("spark - preserve copies attributes", function(test) {                         // 1359
  // make sure attributes are correctly changed (i.e. copied)                               // 1360
  // when preserving old nodes, either because they are labeled                             // 1361
  // or because they are a parent of a labeled node.                                        // 1362
                                                                                            // 1363
  var R1 = ReactiveVar("foo");                                                              // 1364
  var R2 = ReactiveVar("abcd");                                                             // 1365
                                                                                            // 1366
  var frag = WrappedFrag(renderWithPreservation(function() {                                // 1367
    return '<div puppy="'+R1.get()+'"><div><div><div><input name="blah" kittycat="'+        // 1368
      R2.get()+'"></div></div></div></div>';                                                // 1369
  })).hold();                                                                               // 1370
  var node1 = frag.node().firstChild;                                                       // 1371
  var node2 = frag.node().firstChild.getElementsByTagName("input")[0];                      // 1372
  test.equal(node1.nodeName, "DIV");                                                        // 1373
  test.equal(node2.nodeName, "INPUT");                                                      // 1374
  test.equal(node1.getAttribute("puppy"), "foo");                                           // 1375
  test.equal(node2.getAttribute("kittycat"), "abcd");                                       // 1376
                                                                                            // 1377
  R1.set("bar");                                                                            // 1378
  R2.set("efgh");                                                                           // 1379
  Deps.flush();                                                                             // 1380
  test.equal(node1.getAttribute("puppy"), "bar");                                           // 1381
  test.equal(node2.getAttribute("kittycat"), "efgh");                                       // 1382
                                                                                            // 1383
  frag.release();                                                                           // 1384
  Deps.flush();                                                                             // 1385
  test.equal(R1.numListeners(), 0);                                                         // 1386
  test.equal(R2.numListeners(), 0);                                                         // 1387
                                                                                            // 1388
  var R;                                                                                    // 1389
  R = ReactiveVar(false);                                                                   // 1390
  frag = WrappedFrag(renderWithPreservation(function() {                                    // 1391
    return '<input id="foo" type="checkbox"' + (R.get() ? ' checked="checked"' : '') + '>'; // 1392
  })).hold();                                                                               // 1393
  var get_checked = function() { return !! frag.node().firstChild.checked; };               // 1394
  test.equal(get_checked(), false);                                                         // 1395
  Deps.flush();                                                                             // 1396
  test.equal(get_checked(), false);                                                         // 1397
  R.set(true);                                                                              // 1398
  test.equal(get_checked(), false);                                                         // 1399
  Deps.flush();                                                                             // 1400
  test.equal(get_checked(), true);                                                          // 1401
  R.set(false);                                                                             // 1402
  test.equal(get_checked(), true);                                                          // 1403
  Deps.flush();                                                                             // 1404
  test.equal(get_checked(), false);                                                         // 1405
  R.set(true);                                                                              // 1406
  Deps.flush();                                                                             // 1407
  test.equal(get_checked(), true);                                                          // 1408
  frag.release();                                                                           // 1409
  R = ReactiveVar(true);                                                                    // 1410
  frag = WrappedFrag(renderWithPreservation(function() {                                    // 1411
    return '<input type="checkbox"' + (R.get() ? ' checked="checked"' : '') + '>';          // 1412
  })).hold();                                                                               // 1413
  test.equal(get_checked(), true);                                                          // 1414
  Deps.flush();                                                                             // 1415
  test.equal(get_checked(), true);                                                          // 1416
  R.set(false);                                                                             // 1417
  test.equal(get_checked(), true);                                                          // 1418
  Deps.flush();                                                                             // 1419
  test.equal(get_checked(), false);                                                         // 1420
  frag.release();                                                                           // 1421
                                                                                            // 1422
                                                                                            // 1423
  _.each([false, true], function(with_focus) {                                              // 1424
    R = ReactiveVar("apple");                                                               // 1425
    var div = OnscreenDiv(renderWithPreservation(function() {                               // 1426
      return '<input id="foo" type="text" value="' + R.get() + '">';                        // 1427
    }));                                                                                    // 1428
    var maybe_focus = function(div) {                                                       // 1429
      if (with_focus) {                                                                     // 1430
        div.show();                                                                         // 1431
        focusElement(div.node().firstChild);                                                // 1432
      }                                                                                     // 1433
    };                                                                                      // 1434
    maybe_focus(div);                                                                       // 1435
    var get_value = function() { return div.node().firstChild.value; };                     // 1436
    var set_value = function(v) { div.node().firstChild.value = v; };                       // 1437
    var if_blurred = function(v, v2) {                                                      // 1438
      return with_focus ? v2 : v; };                                                        // 1439
    test.equal(get_value(), "apple");                                                       // 1440
    Deps.flush();                                                                           // 1441
    test.equal(get_value(), "apple");                                                       // 1442
    R.set("");                                                                              // 1443
    test.equal(get_value(), "apple");                                                       // 1444
    Deps.flush();                                                                           // 1445
    test.equal(get_value(), if_blurred("", "apple"));                                       // 1446
    R.set("pear");                                                                          // 1447
    test.equal(get_value(), if_blurred("", "apple"));                                       // 1448
    Deps.flush();                                                                           // 1449
    test.equal(get_value(), if_blurred("pear", "apple"));                                   // 1450
    set_value("jerry"); // like user typing                                                 // 1451
    R.set("steve");                                                                         // 1452
    Deps.flush();                                                                           // 1453
    // should overwrite user typing if blurred                                              // 1454
    test.equal(get_value(), if_blurred("steve", "jerry"));                                  // 1455
    div.kill();                                                                             // 1456
    R = ReactiveVar("");                                                                    // 1457
    div = OnscreenDiv(renderWithPreservation(function() {                                   // 1458
      return '<input id="foo" type="text" value="' + R.get() + '">';                        // 1459
    }));                                                                                    // 1460
    maybe_focus(div);                                                                       // 1461
    test.equal(get_value(), "");                                                            // 1462
    Deps.flush();                                                                           // 1463
    test.equal(get_value(), "");                                                            // 1464
    R.set("tom");                                                                           // 1465
    test.equal(get_value(), "");                                                            // 1466
    Deps.flush();                                                                           // 1467
    test.equal(get_value(), if_blurred("tom", ""));                                         // 1468
    div.kill();                                                                             // 1469
    Deps.flush();                                                                           // 1470
  });                                                                                       // 1471
});                                                                                         // 1472
                                                                                            // 1473
Tinytest.add("spark - bad labels", function(test) {                                         // 1474
  // make sure patching behaves gracefully even when labels violate                         // 1475
  // the rules that would allow preservation of nodes identity.                             // 1476
                                                                                            // 1477
  var go = function(html1, html2) {                                                         // 1478
    var R = ReactiveVar(true);                                                              // 1479
    var frag = WrappedFrag(renderWithPreservation(function() {                              // 1480
      return R.get() ? html1 : html2;                                                       // 1481
    })).hold();                                                                             // 1482
                                                                                            // 1483
    R.set(false);                                                                           // 1484
    Deps.flush();                                                                           // 1485
    test.equal(frag.html(), html2);                                                         // 1486
    frag.release();                                                                         // 1487
  };                                                                                        // 1488
                                                                                            // 1489
  go('hello', 'world');                                                                     // 1490
                                                                                            // 1491
  // duplicate IDs (bad developer; but should patch correctly)                              // 1492
  go('<div id="foo">hello</div><b id="foo">world</b>',                                      // 1493
     '<div id="foo">hi</div><b id="foo">there</b>');                                        // 1494
  go('<div id="foo"><b id="foo">hello</b></div>',                                           // 1495
     '<div id="foo"><b id="foo">hi</b></div>');                                             // 1496
  go('<div id="foo">hello</div><b id="foo">world</b>',                                      // 1497
     '<div id="foo"><b id="foo">hi</b></div>');                                             // 1498
                                                                                            // 1499
  // tag name changes                                                                       // 1500
  go('<div id="foo">abcd</div>',                                                            // 1501
     '<p id="foo">efgh</p>');                                                               // 1502
                                                                                            // 1503
  // parent chain changes at all                                                            // 1504
  go('<div><div><div><p id="foo">test123</p></div></div></div>',                            // 1505
     '<div><div><p id="foo">test123</p></div></div>');                                      // 1506
  go('<div><div><div><p id="foo">test123</p></div></div></div>',                            // 1507
     '<div><ins><div><p id="foo">test123</p></div></ins></div>');                           // 1508
                                                                                            // 1509
  // ambiguous names                                                                        // 1510
  go('<ul><li name="me">1</li><li name="me">3</li><li name="me">3</li></ul>',               // 1511
     '<ul><li name="me">4</li><li name="me">5</li></ul>');                                  // 1512
});                                                                                         // 1513
                                                                                            // 1514
                                                                                            // 1515
Tinytest.add("spark - landmark patching", function(test) {                                  // 1516
                                                                                            // 1517
  var rand;                                                                                 // 1518
                                                                                            // 1519
  var randomNodeList = function(optParentTag, depth) {                                      // 1520
    var atTopLevel = ! optParentTag;                                                        // 1521
    var len = rand.nextIntBetween(atTopLevel ? 1 : 0, 6);                                   // 1522
    var buf = [];                                                                           // 1523
    for(var i=0; i<len; i++)                                                                // 1524
      buf.push(randomNode(optParentTag, depth));                                            // 1525
    return buf;                                                                             // 1526
  };                                                                                        // 1527
                                                                                            // 1528
  var randomNode = function(optParentTag, depth) {                                          // 1529
    var n = {};                                                                             // 1530
                                                                                            // 1531
    if (rand.nextBoolean()) {                                                               // 1532
      // text node                                                                          // 1533
      n.text = rand.nextIdentifier(2);                                                      // 1534
    } else {                                                                                // 1535
                                                                                            // 1536
      n.tagName = rand.nextChoice((function() {                                             // 1537
        switch (optParentTag) {                                                             // 1538
        case "p": return ['b', 'i', 'u'];                                                   // 1539
        case "b": return ['i', 'u'];                                                        // 1540
        case "i": return ['u'];                                                             // 1541
        case "u": case "span": return ['span'];                                             // 1542
        default: return ['div', 'ins', 'center', 'p'];                                      // 1543
        }                                                                                   // 1544
      })());                                                                                // 1545
                                                                                            // 1546
      if (rand.nextBoolean())                                                               // 1547
        n.id = rand.nextIdentifier();                                                       // 1548
      if (rand.nextBoolean())                                                               // 1549
        n.name = rand.nextIdentifier();                                                     // 1550
                                                                                            // 1551
      if (depth === 0) {                                                                    // 1552
        n.children = [];                                                                    // 1553
      } else {                                                                              // 1554
        n.children = randomNodeList(n.tagName, depth-1);                                    // 1555
      }                                                                                     // 1556
    }                                                                                       // 1557
                                                                                            // 1558
    var existence = rand.nextChoice([[true, true], [false, true], [true, false]]);          // 1559
    n.existsBefore = existence[0];                                                          // 1560
    n.existsAfter = existence[1];                                                           // 1561
                                                                                            // 1562
    return n;                                                                               // 1563
  };                                                                                        // 1564
                                                                                            // 1565
  var nodeListToHtml = function(list, is_after, optBuf) {                                   // 1566
    var buf = (optBuf || []);                                                               // 1567
    _.each(list, function(n) {                                                              // 1568
      if (is_after ? n.existsAfter : n.existsBefore) {                                      // 1569
        if (n.text) {                                                                       // 1570
          buf.push(n.text);                                                                 // 1571
        } else {                                                                            // 1572
          buf.push('<', n.tagName);                                                         // 1573
          if (n.id)                                                                         // 1574
            buf.push(' id="', n.id, '"');                                                   // 1575
          if (n.name)                                                                       // 1576
            buf.push(' name="', n.name, '"');                                               // 1577
          buf.push('>');                                                                    // 1578
          nodeListToHtml(n.children, is_after, buf);                                        // 1579
          buf.push('</', n.tagName, '>');                                                   // 1580
        }                                                                                   // 1581
      }                                                                                     // 1582
    });                                                                                     // 1583
    return optBuf ? null : buf.join('');                                                    // 1584
  };                                                                                        // 1585
                                                                                            // 1586
  var fillInElementIdentities = function(list, parent, is_after) {                          // 1587
    var elementsInList = _.filter(                                                          // 1588
      list,                                                                                 // 1589
      function(x) {                                                                         // 1590
        return (is_after ? x.existsAfter : x.existsBefore) && x.tagName;                    // 1591
      });                                                                                   // 1592
    var elementsInDom = _.filter(parent.childNodes,                                         // 1593
                                 function(x) { return x.nodeType === 1; });                 // 1594
    test.equal(elementsInList.length, elementsInDom.length);                                // 1595
    for(var i=0; i<elementsInList.length; i++) {                                            // 1596
      elementsInList[i].node = elementsInDom[i];                                            // 1597
      fillInElementIdentities(elementsInList[i].children,                                   // 1598
                              elementsInDom[i]);                                            // 1599
    }                                                                                       // 1600
  };                                                                                        // 1601
                                                                                            // 1602
  var getParentChain = function(node) {                                                     // 1603
    var buf = [];                                                                           // 1604
    while (node) {                                                                          // 1605
      buf.push(node);                                                                       // 1606
      node = node.parentNode;                                                               // 1607
    }                                                                                       // 1608
    return buf;                                                                             // 1609
  };                                                                                        // 1610
                                                                                            // 1611
  var isSameElements = function(a, b) {                                                     // 1612
    if (a.length !== b.length)                                                              // 1613
      return false;                                                                         // 1614
    for(var i=0; i<a.length; i++) {                                                         // 1615
      if (a[i] !== b[i])                                                                    // 1616
        return false;                                                                       // 1617
    }                                                                                       // 1618
    return true;                                                                            // 1619
  };                                                                                        // 1620
                                                                                            // 1621
  var collectLabeledNodeData = function(list, optArray) {                                   // 1622
    var buf = optArray || [];                                                               // 1623
                                                                                            // 1624
    _.each(list, function(x) {                                                              // 1625
      if (x.tagName && x.existsBefore && x.existsAfter) {                                   // 1626
        if (x.name || x.id) {                                                               // 1627
          buf.push({ node: x.node, parents: getParentChain(x.node) });                      // 1628
        }                                                                                   // 1629
        collectLabeledNodeData(x.children, buf);                                            // 1630
      }                                                                                     // 1631
    });                                                                                     // 1632
                                                                                            // 1633
    return buf;                                                                             // 1634
  };                                                                                        // 1635
                                                                                            // 1636
  for(var i=0; i<5; i++) {                                                                  // 1637
    // Use non-deterministic randomness so we can have a shorter fuzz                       // 1638
    // test (fewer iterations).  For deterministic (fully seeded)                           // 1639
    // randomness, remove the call to Random.fraction().                                    // 1640
    rand = new SeededRandom("preserved nodes "+i+" "+Random.fraction());                    // 1641
                                                                                            // 1642
    var R = ReactiveVar(false);                                                             // 1643
    var structure = randomNodeList(null, 6);                                                // 1644
    var frag = WrappedFrag(Meteor.render(function () {                                      // 1645
      return Spark.createLandmark({ preserve: idNameLabels }, function () {                 // 1646
        return nodeListToHtml(structure, R.get());                                          // 1647
      });                                                                                   // 1648
    })).hold();                                                                             // 1649
    test.equal(frag.html(), nodeListToHtml(structure, false) || "<!---->");                 // 1650
    fillInElementIdentities(structure, frag.node());                                        // 1651
    var labeledNodes = collectLabeledNodeData(structure);                                   // 1652
    R.set(true);                                                                            // 1653
    Deps.flush();                                                                           // 1654
    test.equal(frag.html(), nodeListToHtml(structure, true) || "<!---->");                  // 1655
    _.each(labeledNodes, function(x) {                                                      // 1656
      test.isTrue(isSameElements(x.parents, getParentChain(x.node)));                       // 1657
    });                                                                                     // 1658
                                                                                            // 1659
    frag.release();                                                                         // 1660
    Deps.flush();                                                                           // 1661
    test.equal(R.numListeners(), 0);                                                        // 1662
  }                                                                                         // 1663
                                                                                            // 1664
});                                                                                         // 1665
                                                                                            // 1666
Tinytest.add("spark - landmark constant", function(test) {                                  // 1667
                                                                                            // 1668
  var R, div;                                                                               // 1669
                                                                                            // 1670
  // top-level { constant: true }                                                           // 1671
                                                                                            // 1672
  R = ReactiveVar(0);                                                                       // 1673
  var states = [];                                                                          // 1674
  div = OnscreenDiv(Meteor.render(function() {                                              // 1675
    R.get(); // create dependency                                                           // 1676
    return Spark.createLandmark({                                                           // 1677
      constant: true,                                                                       // 1678
      rendered: function() {                                                                // 1679
        states.push(this);                                                                  // 1680
      }                                                                                     // 1681
    }, function() { return '<b/><i/><u/>'; });                                              // 1682
  }));                                                                                      // 1683
                                                                                            // 1684
  var nodes = nodesToArray(div.node().childNodes);                                          // 1685
  test.equal(nodes.length, 3);                                                              // 1686
  Deps.flush();                                                                             // 1687
  test.equal(states.length, 1);                                                             // 1688
  R.set(1);                                                                                 // 1689
  Deps.flush();                                                                             // 1690
  test.equal(states.length, 1); // no render callback on constant                           // 1691
  var nodes2 = nodesToArray(div.node().childNodes);                                         // 1692
  test.equal(nodes2.length, 3);                                                             // 1693
  test.isTrue(nodes[0] === nodes2[0]);                                                      // 1694
  test.isTrue(nodes[1] === nodes2[1]);                                                      // 1695
  test.isTrue(nodes[2] === nodes2[2]);                                                      // 1696
  div.kill();                                                                               // 1697
  Deps.flush();                                                                             // 1698
  test.equal(R.numListeners(), 0);                                                          // 1699
                                                                                            // 1700
  // non-top-level                                                                          // 1701
                                                                                            // 1702
  var i = 1;                                                                                // 1703
  // run test with and without matching branch label                                        // 1704
  _.each([false, true], function(matchLandmark) {                                           // 1705
    // run test with node before or after, or neither or both                               // 1706
    _.each([false, true], function(nodeBefore) {                                            // 1707
      _.each([false, true], function(nodeAfter) {                                           // 1708
        var hasSpan = true;                                                                 // 1709
        var isConstant = true;                                                              // 1710
                                                                                            // 1711
        var crd = null; // [createCount, renderCount, destroyCount]                         // 1712
                                                                                            // 1713
        R = ReactiveVar('foo');                                                             // 1714
        div = OnscreenDiv(Meteor.render(function() {                                        // 1715
          R.get(); // create unconditional dependency                                       // 1716
          var brnch = matchLandmark ? 'myBranch' : ('branch'+(++i));                        // 1717
          return (nodeBefore ? R.get() : '') +                                              // 1718
            Spark.labelBranch(                                                              // 1719
              brnch, function () {                                                          // 1720
                return Spark.createLandmark(                                                // 1721
                  {                                                                         // 1722
                    constant: isConstant,                                                   // 1723
                    created: function () {                                                  // 1724
                      this.crd = [0,0,0];                                                   // 1725
                      if (! crd)                                                            // 1726
                        crd = this.crd; // capture first landmark's crd                     // 1727
                      this.crd[0]++;                                                        // 1728
                    },                                                                      // 1729
                    rendered: function () { this.crd[1]++; },                               // 1730
                    destroyed: function () { this.crd[2]++; }                               // 1731
                  },                                                                        // 1732
                  function() { return hasSpan ?                                             // 1733
                               '<span>stuff</span>' : 'blah'; });}) +                       // 1734
            (nodeAfter ? R.get() : '');                                                     // 1735
        }));                                                                                // 1736
                                                                                            // 1737
        var span = div.node().getElementsByTagName('span')[0];                              // 1738
        hasSpan = false;                                                                    // 1739
                                                                                            // 1740
        test.equal(div.text(),                                                              // 1741
                   (nodeBefore ? 'foo' : '')+                                               // 1742
                   'stuff'+                                                                 // 1743
                   (nodeAfter ? 'foo' : ''));                                               // 1744
                                                                                            // 1745
        R.set('bar');                                                                       // 1746
        Deps.flush();                                                                       // 1747
                                                                                            // 1748
        // only non-matching landmark should cause the constant                             // 1749
        // chunk to be re-rendered                                                          // 1750
        test.equal(div.text(),                                                              // 1751
                   (nodeBefore ? 'bar' : '')+                                               // 1752
                   (matchLandmark ? 'stuff' : 'blah')+                                      // 1753
                   (nodeAfter ? 'bar' : ''));                                               // 1754
        // in non-matching case, first landmark is destroyed.                               // 1755
        // otherwise, it is kept (and not re-rendered because                               // 1756
        // it is constant)                                                                  // 1757
        test.equal(crd, matchLandmark ? [1,1,0] : [1,1,1]);                                 // 1758
                                                                                            // 1759
        R.set('baz');                                                                       // 1760
        Deps.flush();                                                                       // 1761
                                                                                            // 1762
        // should be repeatable (liveranges not damaged)                                    // 1763
        test.equal(div.text(),                                                              // 1764
                   (nodeBefore ? 'baz' : '')+                                               // 1765
                   (matchLandmark ? 'stuff' : 'blah')+                                      // 1766
                   (nodeAfter ? 'baz' : ''));                                               // 1767
                                                                                            // 1768
        isConstant = false; // no longer constant:true!                                     // 1769
        R.set('qux');                                                                       // 1770
        Deps.flush();                                                                       // 1771
        test.equal(div.text(),                                                              // 1772
                   (nodeBefore ? 'qux' : '')+                                               // 1773
                   'blah'+                                                                  // 1774
                   (nodeAfter ? 'qux' : ''));                                               // 1775
                                                                                            // 1776
        // turn constant back on                                                            // 1777
        isConstant = true;                                                                  // 1778
        hasSpan = true;                                                                     // 1779
        R.set('popsicle');                                                                  // 1780
        Deps.flush();                                                                       // 1781
        // we don't get the span, instead old "blah" is preserved                           // 1782
        test.equal(div.text(),                                                              // 1783
                   (nodeBefore ? 'popsicle' : '')+                                          // 1784
                   (matchLandmark ? 'blah' : 'stuff')+                                      // 1785
                   (nodeAfter ? 'popsicle' : ''));                                          // 1786
                                                                                            // 1787
        isConstant = false;                                                                 // 1788
        R.set('hi');                                                                        // 1789
        Deps.flush();                                                                       // 1790
        // now we get the span!                                                             // 1791
        test.equal(div.text(),                                                              // 1792
                   (nodeBefore ? 'hi' : '')+                                                // 1793
                   'stuff'+                                                                 // 1794
                   (nodeAfter ? 'hi' : ''));                                                // 1795
                                                                                            // 1796
        div.kill();                                                                         // 1797
        Deps.flush();                                                                       // 1798
      });                                                                                   // 1799
    });                                                                                     // 1800
  });                                                                                       // 1801
                                                                                            // 1802
  // test that constant landmark gets rendered callback if it                               // 1803
  // wasn't preserved.                                                                      // 1804
                                                                                            // 1805
  var renderCount;                                                                          // 1806
                                                                                            // 1807
  renderCount = 0;                                                                          // 1808
  R = ReactiveVar('div');                                                                   // 1809
  div = OnscreenDiv(Meteor.render(function () {                                             // 1810
    return '<' + R.get() + '>' + Spark.createLandmark(                                      // 1811
      {constant: true, rendered: function () { renderCount++; }},                           // 1812
      function () {                                                                         // 1813
        return "hi";                                                                        // 1814
      }) +                                                                                  // 1815
      '</' + R.get().split(' ')[0] + '>';                                                   // 1816
  }));                                                                                      // 1817
  Deps.flush();                                                                             // 1818
  test.equal(renderCount, 1);                                                               // 1819
                                                                                            // 1820
  R.set('div class="hamburger"');                                                           // 1821
  Deps.flush();                                                                             // 1822
  // constant patched around, not re-rendered!                                              // 1823
  test.equal(renderCount, 1);                                                               // 1824
                                                                                            // 1825
  R.set('span class="hamburger"');                                                          // 1826
  Deps.flush();                                                                             // 1827
  // can't patch parent to a different tag                                                  // 1828
  test.equal(renderCount, 2);                                                               // 1829
                                                                                            // 1830
  R.set('span');                                                                            // 1831
  Deps.flush();                                                                             // 1832
  // can patch here, renderCount stays the same                                             // 1833
  test.equal(renderCount, 2);                                                               // 1834
                                                                                            // 1835
  div.kill();                                                                               // 1836
  Deps.flush();                                                                             // 1837
});                                                                                         // 1838
                                                                                            // 1839
_.each(['STRING', 'MONGO'], function (idGeneration) {                                       // 1840
Tinytest.add("spark - leaderboard, " + idGeneration, function(test) {                       // 1841
  // use a simplified, local leaderboard to test some stuff                                 // 1842
                                                                                            // 1843
  var players = new LocalCollection();                                                      // 1844
  var selected_player = ReactiveVar();                                                      // 1845
                                                                                            // 1846
  var scores = OnscreenDiv(renderWithPreservation(function() {                              // 1847
    var html = Spark.list(                                                                  // 1848
      players.find({}, {sort: {score: -1}}),                                                // 1849
      function(player) {                                                                    // 1850
        return Spark.labelBranch(player._id.valueOf(), function () {                        // 1851
          return Spark.isolate(function () {                                                // 1852
            var style;                                                                      // 1853
            if (_.isEqual(selected_player.get(), player._id))                               // 1854
              style = "player selected";                                                    // 1855
            else                                                                            // 1856
              style = "player";                                                             // 1857
                                                                                            // 1858
            var html = '<div class="' + style + '">' +                                      // 1859
              '<div class="name">' + player.name + '</div>' +                               // 1860
              '<div name="score">' + player.score + '</div></div>';                         // 1861
            html = Spark.setDataContext(player, html);                                      // 1862
            html = Spark.createLandmark(                                                    // 1863
              {preserve: idNameLabels},                                                     // 1864
              function() { return html; });                                                 // 1865
            return html;                                                                    // 1866
          });                                                                               // 1867
        });                                                                                 // 1868
      });                                                                                   // 1869
    html = Spark.attachEvents({                                                             // 1870
      "click": function () {                                                                // 1871
        selected_player.set(this._id);                                                      // 1872
      }                                                                                     // 1873
    }, html);                                                                               // 1874
    return html;                                                                            // 1875
  }));                                                                                      // 1876
  var idGen;                                                                                // 1877
  if (idGeneration === 'STRING')                                                            // 1878
    idGen = _.bind(Random.id, Random);                                                      // 1879
  else                                                                                      // 1880
    idGen = function () { return new LocalCollection._ObjectID(); };                        // 1881
                                                                                            // 1882
  // back before we had scientists we had Vancian hussade players                           // 1883
  var names = ["Glinnes Hulden", "Shira Hulden", "Denzel Warhound",                         // 1884
               "Lute Casagave", "Akadie", "Thammas, Lord Gensifer",                         // 1885
               "Ervil Savat", "Duissane Trevanyi", "Sagmondo Bandolio",                     // 1886
               "Rhyl Shermatz", "Yalden Wirp", "Tyran Lucho",                               // 1887
               "Bump Candolf", "Wilmer Guff", "Carbo Gilweg"];                              // 1888
  for (var i = 0; i < names.length; i++)                                                    // 1889
    players.insert({_id: idGen(), name: names[i], score: i*5});                             // 1890
                                                                                            // 1891
  var bump = function() {                                                                   // 1892
    players.update(selected_player.get(), {$inc: {score: 5}});                              // 1893
  };                                                                                        // 1894
                                                                                            // 1895
  var findPlayerNameDiv = function(name) {                                                  // 1896
    var divs = scores.node().getElementsByTagName('DIV');                                   // 1897
    return _.find(divs, function(div) {                                                     // 1898
      return div.innerHTML === name;                                                        // 1899
    });                                                                                     // 1900
  };                                                                                        // 1901
                                                                                            // 1902
  Deps.flush();                                                                             // 1903
  var glinnesNameNode = findPlayerNameDiv(names[0]);                                        // 1904
  test.isTrue(!! glinnesNameNode);                                                          // 1905
  var glinnesScoreNode = glinnesNameNode.nextSibling;                                       // 1906
  test.equal(glinnesScoreNode.getAttribute("name"), "score");                               // 1907
  clickElement(glinnesNameNode);                                                            // 1908
  Deps.flush();                                                                             // 1909
  glinnesNameNode = findPlayerNameDiv(names[0]);                                            // 1910
  test.isTrue(!! glinnesNameNode);                                                          // 1911
  test.equal(glinnesNameNode.parentNode.className, 'player selected');                      // 1912
  var glinnesId = players.findOne({name: names[0]})._id;                                    // 1913
  test.isTrue(!! glinnesId);                                                                // 1914
  test.equal(selected_player.get(), glinnesId);                                             // 1915
  test.equal(                                                                               // 1916
    canonicalizeHtml(glinnesNameNode.parentNode.innerHTML),                                 // 1917
    '<div class="name">Glinnes Hulden</div><div name="score">0</div>');                     // 1918
                                                                                            // 1919
  bump();                                                                                   // 1920
  Deps.flush();                                                                             // 1921
                                                                                            // 1922
  glinnesNameNode = findPlayerNameDiv(names[0], glinnesNameNode);                           // 1923
  var glinnesScoreNode2 = glinnesNameNode.nextSibling;                                      // 1924
  test.equal(glinnesScoreNode2.getAttribute("name"), "score");                              // 1925
  // move and patch should leave score node the same, because it                            // 1926
  // has a name attribute!                                                                  // 1927
  test.equal(glinnesScoreNode, glinnesScoreNode2);                                          // 1928
  test.equal(glinnesNameNode.parentNode.className, 'player selected');                      // 1929
  test.equal(                                                                               // 1930
    canonicalizeHtml(glinnesNameNode.parentNode.innerHTML),                                 // 1931
    '<div class="name">Glinnes Hulden</div><div name="score">5</div>');                     // 1932
                                                                                            // 1933
  bump();                                                                                   // 1934
  Deps.flush();                                                                             // 1935
                                                                                            // 1936
  glinnesNameNode = findPlayerNameDiv(names[0], glinnesNameNode);                           // 1937
  test.equal(                                                                               // 1938
    canonicalizeHtml(glinnesNameNode.parentNode.innerHTML),                                 // 1939
    '<div class="name">Glinnes Hulden</div><div name="score">10</div>');                    // 1940
                                                                                            // 1941
  scores.kill();                                                                            // 1942
  Deps.flush();                                                                             // 1943
  test.equal(selected_player.numListeners(), 0);                                            // 1944
});                                                                                         // 1945
});                                                                                         // 1946
                                                                                            // 1947
Tinytest.add("spark - list cursor stop", function(test) {                                   // 1948
  // test Spark.list outside of render mode, on custom observable                           // 1949
                                                                                            // 1950
  var numHandles = 0;                                                                       // 1951
  var observable = {                                                                        // 1952
    observeChanges: function(x) {                                                           // 1953
      x.addedBefore("123", {}, null);                                                       // 1954
      x.addedBefore("456", {}, null);                                                       // 1955
      var handle;                                                                           // 1956
      numHandles++;                                                                         // 1957
      return handle = {                                                                     // 1958
        stop: function() {                                                                  // 1959
          numHandles--;                                                                     // 1960
        }                                                                                   // 1961
      };                                                                                    // 1962
    }                                                                                       // 1963
  };                                                                                        // 1964
                                                                                            // 1965
  test.equal(numHandles, 0);                                                                // 1966
  var result = Spark.list(observable, function(doc) {                                       // 1967
    return "#"+doc._id;                                                                     // 1968
  });                                                                                       // 1969
  test.equal(result, "#123#456");                                                           // 1970
  Deps.flush();                                                                             // 1971
  // chunk killed because not created inside Spark.render                                   // 1972
  test.equal(numHandles, 0);                                                                // 1973
                                                                                            // 1974
                                                                                            // 1975
  var R = ReactiveVar(1);                                                                   // 1976
  var frag = WrappedFrag(Meteor.render(function() {                                         // 1977
    if (R.get() > 0)                                                                        // 1978
      return Spark.list(observable, function() { return "*"; });                            // 1979
    return "";                                                                              // 1980
  })).hold();                                                                               // 1981
  test.equal(numHandles, 1);                                                                // 1982
  Deps.flush();                                                                             // 1983
  test.equal(numHandles, 1);                                                                // 1984
  R.set(2);                                                                                 // 1985
  Deps.flush();                                                                             // 1986
  test.equal(numHandles, 1);                                                                // 1987
  R.set(-1);                                                                                // 1988
  Deps.flush();                                                                             // 1989
  test.equal(numHandles, 0);                                                                // 1990
                                                                                            // 1991
  frag.release();                                                                           // 1992
  Deps.flush();                                                                             // 1993
});                                                                                         // 1994
                                                                                            // 1995
Tinytest.add("spark - list table", function(test) {                                         // 1996
  var c = new LocalCollection();                                                            // 1997
                                                                                            // 1998
  c.insert({value: "fudge", order: "A"});                                                   // 1999
  c.insert({value: "sundae", order: "B"});                                                  // 2000
                                                                                            // 2001
  var R = ReactiveVar();                                                                    // 2002
                                                                                            // 2003
  var table = WrappedFrag(Meteor.render(function() {                                        // 2004
    var buf = [];                                                                           // 2005
    buf.push('<table>');                                                                    // 2006
    buf.push(Spark.list(                                                                    // 2007
      c.find({}, {sort: ['order']}),                                                        // 2008
      function(doc) {                                                                       // 2009
        return Spark.labelBranch(doc._id, function () {                                     // 2010
          return Spark.isolate(function () {                                                // 2011
            var html = "<tr><td>"+doc.value + (doc.reactive ? R.get() : '')+                // 2012
              "</td></tr>";                                                                 // 2013
            html = Spark.createLandmark(                                                    // 2014
              {preserve: idNameLabels},                                                     // 2015
              function() { return html; });                                                 // 2016
            return html;                                                                    // 2017
          });                                                                               // 2018
        });                                                                                 // 2019
      },                                                                                    // 2020
      function() {                                                                          // 2021
        return "<tr><td>(nothing)</td></tr>";                                               // 2022
      }));                                                                                  // 2023
    buf.push('</table>');                                                                   // 2024
    return buf.join('');                                                                    // 2025
  })).hold();                                                                               // 2026
                                                                                            // 2027
  var lastHtml;                                                                             // 2028
                                                                                            // 2029
  var shouldFlushTo = function(html) {                                                      // 2030
    // same before flush                                                                    // 2031
    test.equal(table.html(), lastHtml);                                                     // 2032
    Deps.flush();                                                                           // 2033
    test.equal(table.html(), html);                                                         // 2034
    lastHtml = html;                                                                        // 2035
  };                                                                                        // 2036
  var tableOf = function(/*htmls*/) {                                                       // 2037
    if (arguments.length === 0) {                                                           // 2038
      return '<table></table>';                                                             // 2039
    } else {                                                                                // 2040
      return '<table><tbody><tr><td>' +                                                     // 2041
        _.toArray(arguments).join('</td></tr><tr><td>') +                                   // 2042
        '</td></tr></tbody></table>';                                                       // 2043
    }                                                                                       // 2044
  };                                                                                        // 2045
                                                                                            // 2046
  test.equal(table.html(), lastHtml = tableOf('fudge', 'sundae'));                          // 2047
                                                                                            // 2048
  // switch order                                                                           // 2049
  c.update({value: "fudge"}, {$set: {order: "BA"}});                                        // 2050
  shouldFlushTo(tableOf('sundae', 'fudge'));                                                // 2051
                                                                                            // 2052
  // change text                                                                            // 2053
  c.update({value: "fudge"}, {$set: {value: "hello"}});                                     // 2054
  c.update({value: "sundae"}, {$set: {value: "world"}});                                    // 2055
  shouldFlushTo(tableOf('world', 'hello'));                                                 // 2056
                                                                                            // 2057
  // remove all                                                                             // 2058
  c.remove({});                                                                             // 2059
  shouldFlushTo(tableOf('(nothing)'));                                                      // 2060
                                                                                            // 2061
  c.insert({value: "1", order: "A"});                                                       // 2062
  c.insert({value: "5", order: "B"});                                                       // 2063
  c.insert({value: "3", order: "AB"});                                                      // 2064
  c.insert({value: "7", order: "BB"});                                                      // 2065
  c.insert({value: "2", order: "AA"});                                                      // 2066
  c.insert({value: "4", order: "ABA"});                                                     // 2067
  c.insert({value: "6", order: "BA"});                                                      // 2068
  c.insert({value: "8", order: "BBA"});                                                     // 2069
  shouldFlushTo(tableOf('1', '2', '3', '4', '5', '6', '7', '8'));                           // 2070
                                                                                            // 2071
  // make one item newly reactive                                                           // 2072
  R.set('*');                                                                               // 2073
  c.update({value: "7"}, {$set: {reactive: true}});                                         // 2074
  shouldFlushTo(tableOf('1', '2', '3', '4', '5', '6', '7*', '8'));                          // 2075
                                                                                            // 2076
  R.set('!');                                                                               // 2077
  shouldFlushTo(tableOf('1', '2', '3', '4', '5', '6', '7!', '8'));                          // 2078
                                                                                            // 2079
  // move it                                                                                // 2080
  c.update({value: "7"}, {$set: {order: "A0"}});                                            // 2081
  shouldFlushTo(tableOf('1', '7!', '2', '3', '4', '5', '6', '8'));                          // 2082
                                                                                            // 2083
  // still reactive?                                                                        // 2084
  R.set('?');                                                                               // 2085
  shouldFlushTo(tableOf('1', '7?', '2', '3', '4', '5', '6', '8'));                          // 2086
                                                                                            // 2087
  // go nuts                                                                                // 2088
  c.update({value: '1'}, {$set: {reactive: true}});                                         // 2089
  c.update({value: '1'}, {$set: {reactive: false}});                                        // 2090
  c.update({value: '2'}, {$set: {reactive: true}});                                         // 2091
  c.update({value: '2'}, {$set: {order: "BBB"}});                                           // 2092
  R.set(';');                                                                               // 2093
  R.set('.');                                                                               // 2094
  shouldFlushTo(tableOf('1', '7.', '3', '4', '5', '6', '8', '2.'));                         // 2095
                                                                                            // 2096
  for(var i=1; i<=8; i++)                                                                   // 2097
    c.update({value: String(i)},                                                            // 2098
             {$set: {reactive: true, value: '='+String(i)}});                               // 2099
  R.set('!');                                                                               // 2100
  shouldFlushTo(tableOf('=1!', '=7!', '=3!', '=4!', '=5!', '=6!', '=8!', '=2!'));           // 2101
                                                                                            // 2102
  for(var i=1; i<=8; i++)                                                                   // 2103
    c.update({value: '='+String(i)},                                                        // 2104
             {$set: {order: "A"+i}});                                                       // 2105
  shouldFlushTo(tableOf('=1!', '=2!', '=3!', '=4!', '=5!', '=6!', '=7!', '=8!'));           // 2106
                                                                                            // 2107
  var valueFunc = function(n) { return '<b name="bold">'+n+'</b>'; };                       // 2108
  for(var i=1; i<=8; i++)                                                                   // 2109
    c.update({value: '='+String(i)},                                                        // 2110
             {$set: {value: valueFunc(i)}});                                                // 2111
  shouldFlushTo(tableOf.apply(                                                              // 2112
    null,                                                                                   // 2113
    _.map(_.range(1,9), function(n) { return valueFunc(n)+R.get(); })));                    // 2114
                                                                                            // 2115
  test.equal(table.node().firstChild.rows.length, 8);                                       // 2116
                                                                                            // 2117
  var bolds = table.node().firstChild.getElementsByTagName('B');                            // 2118
  test.equal(bolds.length, 8);                                                              // 2119
  _.each(bolds, function(b) {                                                               // 2120
    b.nifty = {}; // mark the nodes; non-primitive value won't appear in IE HTML            // 2121
  });                                                                                       // 2122
                                                                                            // 2123
  R.set('...');                                                                             // 2124
  shouldFlushTo(tableOf.apply(                                                              // 2125
    null,                                                                                   // 2126
    _.map(_.range(1,9), function(n) { return valueFunc(n)+R.get(); })));                    // 2127
  var bolds2 = table.node().firstChild.getElementsByTagName('B');                           // 2128
  test.equal(bolds2.length, 8);                                                             // 2129
  // make sure patching is actually happening                                               // 2130
  _.each(bolds2, function(b) {                                                              // 2131
    test.equal(!! b.nifty, true);                                                           // 2132
  });                                                                                       // 2133
                                                                                            // 2134
  // change value func, and still we should be patching                                     // 2135
  var valueFunc2 = function(n) { return '<b name="bold">'+n+'</b><i>yeah</i>'; };           // 2136
  for(var i=1; i<=8; i++)                                                                   // 2137
    c.update({value: valueFunc(i)},                                                         // 2138
             {$set: {value: valueFunc2(i)}});                                               // 2139
  shouldFlushTo(tableOf.apply(                                                              // 2140
    null,                                                                                   // 2141
    _.map(_.range(1,9), function(n) { return valueFunc2(n)+R.get(); })));                   // 2142
  var bolds3 = table.node().firstChild.getElementsByTagName('B');                           // 2143
  test.equal(bolds3.length, 8);                                                             // 2144
  _.each(bolds3, function(b) {                                                              // 2145
    test.equal(!! b.nifty, true);                                                           // 2146
  });                                                                                       // 2147
                                                                                            // 2148
  table.release();                                                                          // 2149
                                                                                            // 2150
});                                                                                         // 2151
                                                                                            // 2152
                                                                                            // 2153
Tinytest.add("spark - list event data", function(test) {                                    // 2154
  // this is based on a bug                                                                 // 2155
                                                                                            // 2156
  var lastClicked = null;                                                                   // 2157
  var R = ReactiveVar(0);                                                                   // 2158
  var later;                                                                                // 2159
  var div = OnscreenDiv(Meteor.render(function() {                                          // 2160
    var html = Spark.list(                                                                  // 2161
      {                                                                                     // 2162
        observeChanges: function(observer) {                                                // 2163
          observer.addedBefore("1", {name: 'Foo'}, null);                                   // 2164
          observer.addedBefore("2", {name: 'Bar'}, null);                                   // 2165
          // exercise callback path                                                         // 2166
          later = function() {                                                              // 2167
            observer.addedBefore("3", {name: 'Baz'}, null);                                 // 2168
            observer.addedBefore("4", {name: 'Qux'}, null);                                 // 2169
          };                                                                                // 2170
          return { stop: function() {} };                                                   // 2171
        }                                                                                   // 2172
      },                                                                                    // 2173
      function(doc) {                                                                       // 2174
        var html = Spark.isolate(function () {                                              // 2175
          R.get(); // depend on R                                                           // 2176
          return '<div>' + doc.name + '</div>';                                             // 2177
        });                                                                                 // 2178
        html = Spark.setDataContext(doc, html);                                             // 2179
        return html;                                                                        // 2180
      }                                                                                     // 2181
    );                                                                                      // 2182
    html = Spark.attachEvents({                                                             // 2183
      'click': function (event) {                                                           // 2184
        lastClicked = this.name;                                                            // 2185
        R.set(R.get() + 1); // signal all dependers on R                                    // 2186
      }                                                                                     // 2187
    }, html);                                                                               // 2188
    return html;                                                                            // 2189
  }));                                                                                      // 2190
                                                                                            // 2191
  var item = function(name) {                                                               // 2192
    return _.find(div.node().getElementsByTagName('div'), function(d) {                     // 2193
      return d.innerHTML === name; });                                                      // 2194
  };                                                                                        // 2195
                                                                                            // 2196
  later();                                                                                  // 2197
  Deps.flush();                                                                             // 2198
  test.equal(item("Foo").innerHTML, "Foo");                                                 // 2199
  test.equal(item("Bar").innerHTML, "Bar");                                                 // 2200
  test.equal(item("Baz").innerHTML, "Baz");                                                 // 2201
  test.equal(item("Qux").innerHTML, "Qux");                                                 // 2202
                                                                                            // 2203
  var doClick = function(name) {                                                            // 2204
    clickElement(item(name));                                                               // 2205
    test.equal(lastClicked, name);                                                          // 2206
    Deps.flush();                                                                           // 2207
  };                                                                                        // 2208
                                                                                            // 2209
  doClick("Foo");                                                                           // 2210
  doClick("Bar");                                                                           // 2211
  doClick("Baz");                                                                           // 2212
  doClick("Qux");                                                                           // 2213
  doClick("Bar");                                                                           // 2214
  doClick("Foo");                                                                           // 2215
  doClick("Foo");                                                                           // 2216
  doClick("Foo");                                                                           // 2217
  doClick("Qux");                                                                           // 2218
  doClick("Baz");                                                                           // 2219
  doClick("Baz");                                                                           // 2220
  doClick("Baz");                                                                           // 2221
  doClick("Bar");                                                                           // 2222
  doClick("Baz");                                                                           // 2223
  doClick("Foo");                                                                           // 2224
  doClick("Qux");                                                                           // 2225
  doClick("Foo");                                                                           // 2226
                                                                                            // 2227
  div.kill();                                                                               // 2228
  Deps.flush();                                                                             // 2229
                                                                                            // 2230
});                                                                                         // 2231
                                                                                            // 2232
                                                                                            // 2233
Tinytest.add("spark - events on preserved nodes", function(test) {                          // 2234
  var count = ReactiveVar(0);                                                               // 2235
  var demo = OnscreenDiv(renderWithPreservation(function() {                                // 2236
    var html = Spark.isolate(function () {                                                  // 2237
      return '<div class="button_demo">'+                                                   // 2238
        '<input type="button" name="press" value="Press this button">'+                     // 2239
        '<div>The button has been pressed '+count.get()+' times.</div>'+                    // 2240
        '</div>';                                                                           // 2241
    });                                                                                     // 2242
    html = Spark.attachEvents({                                                             // 2243
      'click input': function() {                                                           // 2244
        count.set(count.get() + 1);                                                         // 2245
      }                                                                                     // 2246
    }, html);                                                                               // 2247
    return html;                                                                            // 2248
  }));                                                                                      // 2249
                                                                                            // 2250
  var click = function() {                                                                  // 2251
    clickElement(demo.node().getElementsByTagName('input')[0]);                             // 2252
  };                                                                                        // 2253
                                                                                            // 2254
  test.equal(count.get(), 0);                                                               // 2255
  for(var i=0; i<10; i++) {                                                                 // 2256
    click();                                                                                // 2257
    Deps.flush();                                                                           // 2258
    test.equal(count.get(), i+1);                                                           // 2259
  }                                                                                         // 2260
                                                                                            // 2261
  demo.kill();                                                                              // 2262
  Deps.flush();                                                                             // 2263
});                                                                                         // 2264
                                                                                            // 2265
                                                                                            // 2266
Tinytest.add("spark - cleanup", function(test) {                                            // 2267
                                                                                            // 2268
  // more exhaustive clean-up testing                                                       // 2269
  var stuff = new LocalCollection();                                                        // 2270
                                                                                            // 2271
  var add_doc = function() {                                                                // 2272
    stuff.insert({foo:'bar'}); };                                                           // 2273
  var clear_docs = function() {                                                             // 2274
    stuff.remove({}); };                                                                    // 2275
  var remove_one = function() {                                                             // 2276
    stuff.remove(stuff.findOne()._id); };                                                   // 2277
                                                                                            // 2278
  add_doc(); // start the collection with a doc                                             // 2279
                                                                                            // 2280
  var R = ReactiveVar("x");                                                                 // 2281
                                                                                            // 2282
  var div = OnscreenDiv(Spark.render(function() {                                           // 2283
    return Spark.list(                                                                      // 2284
      stuff.find(),                                                                         // 2285
      function() {                                                                          // 2286
        return Spark.isolate(function () { return R.get()+"1"; });                          // 2287
      },                                                                                    // 2288
      function() {                                                                          // 2289
        return Spark.isolate(function () { return R.get()+"0"; });                          // 2290
      });                                                                                   // 2291
  }));                                                                                      // 2292
                                                                                            // 2293
  test.equal(div.text(), "x1");                                                             // 2294
  Deps.flush();                                                                             // 2295
  test.equal(div.text(), "x1");                                                             // 2296
  test.equal(R.numListeners(), 1);                                                          // 2297
                                                                                            // 2298
  clear_docs();                                                                             // 2299
  Deps.flush();                                                                             // 2300
  test.equal(div.text(), "x0");                                                             // 2301
  test.equal(R.numListeners(), 1); // test clean-up of doc on remove                        // 2302
                                                                                            // 2303
  add_doc();                                                                                // 2304
  Deps.flush();                                                                             // 2305
  test.equal(div.text(), "x1");                                                             // 2306
  test.equal(R.numListeners(), 1); // test clean-up of "else" listeners                     // 2307
                                                                                            // 2308
  add_doc();                                                                                // 2309
  Deps.flush();                                                                             // 2310
  test.equal(div.text(), "x1x1");                                                           // 2311
  test.equal(R.numListeners(), 2);                                                          // 2312
                                                                                            // 2313
  remove_one();                                                                             // 2314
  Deps.flush();                                                                             // 2315
  test.equal(div.text(), "x1");                                                             // 2316
  test.equal(R.numListeners(), 1); // test clean-up of doc with other docs                  // 2317
                                                                                            // 2318
  div.kill();                                                                               // 2319
  Deps.flush();                                                                             // 2320
  test.equal(R.numListeners(), 0);                                                          // 2321
                                                                                            // 2322
  //// list stopped if not materialized                                                     // 2323
                                                                                            // 2324
  var observeCount = 0;                                                                     // 2325
  var stopCount = 0;                                                                        // 2326
  var cursor = {                                                                            // 2327
    observeChanges: function (callbacks) {                                                  // 2328
      observeCount++;                                                                       // 2329
      return {                                                                              // 2330
        stop: function () {                                                                 // 2331
          stopCount++;                                                                      // 2332
        }                                                                                   // 2333
      };                                                                                    // 2334
    }                                                                                       // 2335
  };                                                                                        // 2336
                                                                                            // 2337
  div = OnscreenDiv(Spark.render(function () {                                              // 2338
    var html = Spark.list(cursor,                                                           // 2339
                          function () { return ''; });                                      // 2340
    // don't return html                                                                    // 2341
    return 'hi';                                                                            // 2342
  }));                                                                                      // 2343
  // we expect that the implementation of Spark.list observed the                           // 2344
  // cursor in order to generate HTML, and then stopped it when                             // 2345
  // it saw that the annotation wasn't materialized.  Other acceptable                      // 2346
  // implementations of Spark.list might avoid observing the cursor                         // 2347
  // altogether, resulting in [0, 0], or might defer the stopping to                        // 2348
  // flush time.                                                                            // 2349
  test.equal([observeCount, stopCount], [1, 1]);                                            // 2350
                                                                                            // 2351
  div.kill();                                                                               // 2352
  Deps.flush();                                                                             // 2353
});                                                                                         // 2354
                                                                                            // 2355
                                                                                            // 2356
var make_input_tester = function(render_func, events) {                                     // 2357
  var buf = [];                                                                             // 2358
                                                                                            // 2359
  if (typeof render_func === "string") {                                                    // 2360
    var render_str = render_func;                                                           // 2361
    render_func = function() { return render_str; };                                        // 2362
  }                                                                                         // 2363
  if (typeof events === "string") {                                                         // 2364
    events = eventmap.apply(null, _.toArray(arguments).slice(1));                           // 2365
  }                                                                                         // 2366
                                                                                            // 2367
  var R = ReactiveVar(0);                                                                   // 2368
  var div = OnscreenDiv(                                                                    // 2369
    renderWithPreservation(function() {                                                     // 2370
      R.get(); // create dependency                                                         // 2371
      var html = render_func();                                                             // 2372
      html = Spark.attachEvents(events, html);                                              // 2373
      html = Spark.setDataContext(buf, html);                                               // 2374
      return html;                                                                          // 2375
    }));                                                                                    // 2376
  div.show(true);                                                                           // 2377
                                                                                            // 2378
  var getbuf = function() {                                                                 // 2379
    var ret = buf.slice();                                                                  // 2380
    buf.length = 0;                                                                         // 2381
    return ret;                                                                             // 2382
  };                                                                                        // 2383
                                                                                            // 2384
  var self;                                                                                 // 2385
  return self = {                                                                           // 2386
    focus: function(optCallback) {                                                          // 2387
      focusElement(self.inputNode());                                                       // 2388
                                                                                            // 2389
      if (optCallback)                                                                      // 2390
        Meteor.defer(function() { optCallback(getbuf()); });                                // 2391
      else                                                                                  // 2392
        return getbuf();                                                                    // 2393
    },                                                                                      // 2394
    blur: function(optCallback) {                                                           // 2395
      blurElement(self.inputNode());                                                        // 2396
                                                                                            // 2397
      if (optCallback)                                                                      // 2398
        Meteor.defer(function() { optCallback(getbuf()); });                                // 2399
      else                                                                                  // 2400
        return getbuf();                                                                    // 2401
    },                                                                                      // 2402
    click: function() {                                                                     // 2403
      clickElement(self.inputNode());                                                       // 2404
      return getbuf();                                                                      // 2405
    },                                                                                      // 2406
    kill: function() {                                                                      // 2407
      // clean up                                                                           // 2408
      div.kill();                                                                           // 2409
      Deps.flush();                                                                         // 2410
    },                                                                                      // 2411
    inputNode: function() {                                                                 // 2412
      return div.node().getElementsByTagName("input")[0];                                   // 2413
    },                                                                                      // 2414
    redraw: function() {                                                                    // 2415
      R.set(R.get() + 1);                                                                   // 2416
      Deps.flush();                                                                         // 2417
    }                                                                                       // 2418
  };                                                                                        // 2419
};                                                                                          // 2420
                                                                                            // 2421
// Note:  These tests MAY FAIL if the browser window doesn't have focus                     // 2422
// (isn't frontmost) in some browsers, particularly Firefox.                                // 2423
testAsyncMulti("spark - focus/blur events",                                                 // 2424
  (function() {                                                                             // 2425
                                                                                            // 2426
    var textLevel1 = '<input type="text" />';                                               // 2427
    var textLevel2 = '<span id="spanOfMurder"><input type="text" /></span>';                // 2428
                                                                                            // 2429
    var focus_test = function(render_func, events, expected_results) {                      // 2430
      return function(test, expect) {                                                       // 2431
        var tester = make_input_tester(render_func, events);                                // 2432
        var callback = expect(expected_results);                                            // 2433
        tester.focus(function(buf) {                                                        // 2434
          tester.kill();                                                                    // 2435
          callback(buf);                                                                    // 2436
        });                                                                                 // 2437
      };                                                                                    // 2438
    };                                                                                      // 2439
                                                                                            // 2440
    var blur_test = function(render_func, events, expected_results) {                       // 2441
      return function(test, expect) {                                                       // 2442
        var tester = make_input_tester(render_func, events);                                // 2443
        var callback = expect(expected_results);                                            // 2444
        tester.focus();                                                                     // 2445
        tester.blur(function(buf) {                                                         // 2446
          tester.kill();                                                                    // 2447
          callback(buf);                                                                    // 2448
        });                                                                                 // 2449
      };                                                                                    // 2450
    };                                                                                      // 2451
                                                                                            // 2452
    return [                                                                                // 2453
                                                                                            // 2454
      // focus on top-level input                                                           // 2455
      focus_test(textLevel1, 'focus input', ['focus input']),                               // 2456
                                                                                            // 2457
      // focus on second-level input                                                        // 2458
      // issue #108                                                                         // 2459
      focus_test(textLevel2, 'focus input', ['focus input']),                               // 2460
                                                                                            // 2461
      // focusin                                                                            // 2462
      focus_test(textLevel1, 'focusin input', ['focusin input']),                           // 2463
      focus_test(textLevel2, 'focusin input', ['focusin input']),                           // 2464
                                                                                            // 2465
      // focusin bubbles                                                                    // 2466
      focus_test(textLevel2, 'focusin span', ['focusin span']),                             // 2467
                                                                                            // 2468
      // focus doesn't bubble                                                               // 2469
      focus_test(textLevel2, 'focus span', []),                                             // 2470
                                                                                            // 2471
      // blur works, doesn't bubble                                                         // 2472
      blur_test(textLevel1, 'blur input', ['blur input']),                                  // 2473
      blur_test(textLevel2, 'blur input', ['blur input']),                                  // 2474
      blur_test(textLevel2, 'blur span', []),                                               // 2475
                                                                                            // 2476
      // focusout works, bubbles                                                            // 2477
      blur_test(textLevel1, 'focusout input', ['focusout input']),                          // 2478
      blur_test(textLevel2, 'focusout input', ['focusout input']),                          // 2479
      blur_test(textLevel2, 'focusout span', ['focusout span'])                             // 2480
    ];                                                                                      // 2481
  })());                                                                                    // 2482
                                                                                            // 2483
                                                                                            // 2484
Tinytest.add("spark - change events", function(test) {                                      // 2485
                                                                                            // 2486
  var checkboxLevel1 = '<input type="checkbox" />';                                         // 2487
  var checkboxLevel2 = '<span id="spanOfMurder">'+                                          // 2488
    '<input type="checkbox" id="checkboxy" /></span>';                                      // 2489
                                                                                            // 2490
                                                                                            // 2491
  // on top-level                                                                           // 2492
  var checkbox1 = make_input_tester(checkboxLevel1, 'change input');                        // 2493
  test.equal(checkbox1.click(), ['change input']);                                          // 2494
  checkbox1.kill();                                                                         // 2495
                                                                                            // 2496
  // on second-level (should bubble)                                                        // 2497
  var checkbox2 = make_input_tester(checkboxLevel2,                                         // 2498
                                    'change input', 'change span');                         // 2499
  test.equal(checkbox2.click(), ['change input', 'change span']);                           // 2500
  test.equal(checkbox2.click(), ['change input', 'change span']);                           // 2501
  checkbox2.redraw();                                                                       // 2502
  test.equal(checkbox2.click(), ['change input', 'change span']);                           // 2503
  checkbox2.kill();                                                                         // 2504
                                                                                            // 2505
  checkbox2 = make_input_tester(checkboxLevel2, 'change input');                            // 2506
  test.equal(checkbox2.focus(), []);                                                        // 2507
  test.equal(checkbox2.click(), ['change input']);                                          // 2508
  test.equal(checkbox2.blur(), []);                                                         // 2509
  test.equal(checkbox2.click(), ['change input']);                                          // 2510
  checkbox2.kill();                                                                         // 2511
                                                                                            // 2512
  var checkbox2 = make_input_tester(                                                        // 2513
    checkboxLevel2,                                                                         // 2514
    'change input', 'change span', 'change div');                                           // 2515
  test.equal(checkbox2.click(), ['change input', 'change span']);                           // 2516
  checkbox2.kill();                                                                         // 2517
                                                                                            // 2518
});                                                                                         // 2519
                                                                                            // 2520
                                                                                            // 2521
testAsyncMulti(                                                                             // 2522
  "spark - submit events",                                                                  // 2523
  (function() {                                                                             // 2524
    var hitlist = [];                                                                       // 2525
    var killLater = function(thing) {                                                       // 2526
      hitlist.push(thing);                                                                  // 2527
    };                                                                                      // 2528
                                                                                            // 2529
    var LIVEUI_TEST_RESPONDER = "/spark_test_responder";                                    // 2530
    var IFRAME_URL_1 = LIVEUI_TEST_RESPONDER + "/";                                         // 2531
    var IFRAME_URL_2 = "about:blank"; // most cross-browser-compatible                      // 2532
    if (window.opera) // opera doesn't like 'about:blank' form target                       // 2533
      IFRAME_URL_2 = LIVEUI_TEST_RESPONDER+"/blank";                                        // 2534
                                                                                            // 2535
    return [                                                                                // 2536
      function(test, expect) {                                                              // 2537
                                                                                            // 2538
        // Submit events can be canceled with preventDefault, which prevents the            // 2539
        // browser's native form submission behavior.  This behavior takes some             // 2540
        // work to ensure cross-browser, so we want to test it.  To detect                  // 2541
        // a form submission, we target the form at an iframe.  Iframe security             // 2542
        // makes this tricky.  What we do is load a page from the server that               // 2543
        // calls us back on 'load' and 'unload'.  We wait for 'load', set up the            // 2544
        // test, and then see if we get an 'unload' (due to the form submission             // 2545
        // going through) or not.                                                           // 2546
        //                                                                                  // 2547
        // This is quite a tricky implementation.                                           // 2548
                                                                                            // 2549
        var withIframe = function(onReady1, onReady2) {                                     // 2550
          var frameName = "submitframe"+String(Random.fraction()).slice(2);                 // 2551
          var iframeDiv = OnscreenDiv(                                                      // 2552
            Meteor.render(function() {                                                      // 2553
              return '<iframe name="'+frameName+'" '+                                       // 2554
                'src="'+IFRAME_URL_1+'"></iframe>';                                         // 2555
            }));                                                                            // 2556
          var iframe = iframeDiv.node().firstChild;                                         // 2557
                                                                                            // 2558
          iframe.loadFunc = function() {                                                    // 2559
            onReady1(frameName, iframe, iframeDiv);                                         // 2560
            onReady2(frameName, iframe, iframeDiv);                                         // 2561
          };                                                                                // 2562
          iframe.unloadFunc = function() {                                                  // 2563
            iframe.DID_CHANGE_PAGE = true;                                                  // 2564
          };                                                                                // 2565
        };                                                                                  // 2566
        var expectCheckLater = function(options) {                                          // 2567
          var check = expect(function(iframe, iframeDiv) {                                  // 2568
            if (options.shouldSubmit)                                                       // 2569
              test.isTrue(iframe.DID_CHANGE_PAGE);                                          // 2570
            else                                                                            // 2571
              test.isFalse(iframe.DID_CHANGE_PAGE);                                         // 2572
                                                                                            // 2573
            // must do this inside expect() so it happens in time                           // 2574
            killLater(iframeDiv);                                                           // 2575
          });                                                                               // 2576
          var checkLater = function(frameName, iframe, iframeDiv) {                         // 2577
            Meteor.setTimeout(function() {                                                  // 2578
              check(iframe, iframeDiv);                                                     // 2579
            }, 500); // wait for frame to unload                                            // 2580
          };                                                                                // 2581
          return checkLater;                                                                // 2582
        };                                                                                  // 2583
        var buttonFormHtml = function(frameName) {                                          // 2584
          return '<div style="height:0;overflow:hidden">'+                                  // 2585
            '<form action="'+IFRAME_URL_2+'" target="'+                                     // 2586
            frameName+'">'+                                                                 // 2587
            '<span><input type="submit"></span>'+                                           // 2588
            '</form></div>';                                                                // 2589
        };                                                                                  // 2590
                                                                                            // 2591
        // test that form submission by click fires event,                                  // 2592
        // and also actually submits                                                        // 2593
        withIframe(function(frameName, iframe) {                                            // 2594
          var form = make_input_tester(                                                     // 2595
            buttonFormHtml(frameName), 'submit form');                                      // 2596
          test.equal(form.click(), ['submit form']);                                        // 2597
          killLater(form);                                                                  // 2598
        }, expectCheckLater({shouldSubmit:true}));                                          // 2599
                                                                                            // 2600
        // submit bubbles up                                                                // 2601
        withIframe(function(frameName, iframe) {                                            // 2602
          var form = make_input_tester(                                                     // 2603
            buttonFormHtml(frameName), 'submit form', 'submit div');                        // 2604
          test.equal(form.click(), ['submit form', 'submit div']);                          // 2605
          killLater(form);                                                                  // 2606
        }, expectCheckLater({shouldSubmit:true}));                                          // 2607
                                                                                            // 2608
        // preventDefault works, still bubbles                                              // 2609
        withIframe(function(frameName, iframe) {                                            // 2610
          var form = make_input_tester(                                                     // 2611
            buttonFormHtml(frameName), {                                                    // 2612
              'submit form': function(evt) {                                                // 2613
                test.equal(evt.type, 'submit');                                             // 2614
                test.equal(evt.target.nodeName, 'FORM');                                    // 2615
                this.push('submit form');                                                   // 2616
                evt.preventDefault();                                                       // 2617
              },                                                                            // 2618
              'submit div': function(evt) {                                                 // 2619
                test.equal(evt.type, 'submit');                                             // 2620
                test.equal(evt.target.nodeName, 'FORM');                                    // 2621
                this.push('submit div');                                                    // 2622
              },                                                                            // 2623
              'submit a': function(evt) {                                                   // 2624
                this.push('submit a');                                                      // 2625
              }                                                                             // 2626
            }                                                                               // 2627
          );                                                                                // 2628
          test.equal(form.click(), ['submit form', 'submit div']);                          // 2629
          killLater(form);                                                                  // 2630
        }, expectCheckLater({shouldSubmit:false}));                                         // 2631
                                                                                            // 2632
      },                                                                                    // 2633
      function(test, expect) {                                                              // 2634
        _.each(hitlist, function(thing) {                                                   // 2635
          thing.kill();                                                                     // 2636
        });                                                                                 // 2637
        Deps.flush();                                                                       // 2638
      }                                                                                     // 2639
    ];                                                                                      // 2640
  })());                                                                                    // 2641
                                                                                            // 2642
                                                                                            // 2643
Tinytest.add("spark - controls - radio", function(test) {                                   // 2644
  var R = ReactiveVar("");                                                                  // 2645
  var R2 = ReactiveVar("");                                                                 // 2646
  var change_buf = [];                                                                      // 2647
  var div = OnscreenDiv(renderWithPreservation(function() {                                 // 2648
    // Re-render when R2 is changed, even though it doesn't affect HTML.                    // 2649
    R2.get();                                                                               // 2650
                                                                                            // 2651
    var buf = [];                                                                           // 2652
    buf.push("Band: ");                                                                     // 2653
    _.each(["AM", "FM", "XM"], function(band) {                                             // 2654
      var checked = (R.get() === band) ? 'checked="checked"' : '';                          // 2655
      buf.push('<input type="radio" name="bands" '+                                         // 2656
               'value="'+band+'" '+checked+'/>');                                           // 2657
    });                                                                                     // 2658
    buf.push(R.get());                                                                      // 2659
    var html = buf.join('');                                                                // 2660
                                                                                            // 2661
    html = Spark.attachEvents({                                                             // 2662
      'change input': function(event) {                                                     // 2663
        // IE 7 is known to fire change events on all                                       // 2664
        // the radio buttons with checked=false, as if                                      // 2665
        // each button were deselected before selecting                                     // 2666
        // the new one.  (Meteor doesn't normalize this                                     // 2667
        // behavior.)                                                                       // 2668
        // However, browsers are consistent if we are                                       // 2669
        // getting a checked=true notification.                                             // 2670
        var btn = event.target;                                                             // 2671
        if (btn.checked) {                                                                  // 2672
          var band = btn.value;                                                             // 2673
          change_buf.push(band);                                                            // 2674
          R.set(band);                                                                      // 2675
        }                                                                                   // 2676
      }                                                                                     // 2677
    }, html);                                                                               // 2678
    return html;                                                                            // 2679
  }));                                                                                      // 2680
                                                                                            // 2681
  Deps.flush();                                                                             // 2682
                                                                                            // 2683
  // get the three buttons; they should be considered 'labeled'                             // 2684
  // by the patcher and not change identities!                                              // 2685
  var btns = nodesToArray(div.node().getElementsByTagName("INPUT"));                        // 2686
                                                                                            // 2687
  test.equal(_.pluck(btns, 'checked'), [false, false, false]);                              // 2688
  test.equal(div.text(), "Band: ");                                                         // 2689
                                                                                            // 2690
  clickElement(btns[0]);                                                                    // 2691
  test.equal(change_buf, ['AM']);                                                           // 2692
  change_buf.length = 0;                                                                    // 2693
  Deps.flush();                                                                             // 2694
  test.equal(_.pluck(btns, 'checked'), [true, false, false]);                               // 2695
  test.equal(div.text(), "Band: AM");                                                       // 2696
                                                                                            // 2697
  R2.set("change");                                                                         // 2698
  Deps.flush();                                                                             // 2699
  test.length(change_buf, 0);                                                               // 2700
  test.equal(_.pluck(btns, 'checked'), [true, false, false]);                               // 2701
  test.equal(div.text(), "Band: AM");                                                       // 2702
                                                                                            // 2703
  clickElement(btns[1]);                                                                    // 2704
  test.equal(change_buf, ['FM']);                                                           // 2705
  change_buf.length = 0;                                                                    // 2706
  Deps.flush();                                                                             // 2707
  test.equal(_.pluck(btns, 'checked'), [false, true, false]);                               // 2708
  test.equal(div.text(), "Band: FM");                                                       // 2709
                                                                                            // 2710
  clickElement(btns[2]);                                                                    // 2711
  test.equal(change_buf, ['XM']);                                                           // 2712
  change_buf.length = 0;                                                                    // 2713
  Deps.flush();                                                                             // 2714
  test.equal(_.pluck(btns, 'checked'), [false, false, true]);                               // 2715
  test.equal(div.text(), "Band: XM");                                                       // 2716
                                                                                            // 2717
  clickElement(btns[1]);                                                                    // 2718
  test.equal(change_buf, ['FM']);                                                           // 2719
  change_buf.length = 0;                                                                    // 2720
  Deps.flush();                                                                             // 2721
  test.equal(_.pluck(btns, 'checked'), [false, true, false]);                               // 2722
  test.equal(div.text(), "Band: FM");                                                       // 2723
                                                                                            // 2724
  div.kill();                                                                               // 2725
});                                                                                         // 2726
                                                                                            // 2727
Tinytest.add("spark - controls - checkbox", function(test) {                                // 2728
  var labels = ["Foo", "Bar", "Baz"];                                                       // 2729
  var Rs = {};                                                                              // 2730
  _.each(labels, function (label) {                                                         // 2731
    Rs[label] = ReactiveVar(false);                                                         // 2732
  });                                                                                       // 2733
  var changeBuf = [];                                                                       // 2734
  var div = OnscreenDiv(renderWithPreservation(function() {                                 // 2735
    var buf = [];                                                                           // 2736
    _.each(labels, function (label) {                                                       // 2737
      var checked = Rs[label].get() ? 'checked="checked"' : '';                             // 2738
      buf.push('<input type="checkbox" name="checky" '+                                     // 2739
               'value="'+label+'" '+checked+'/>');                                          // 2740
    });                                                                                     // 2741
    return buf.join('');                                                                    // 2742
  }));                                                                                      // 2743
                                                                                            // 2744
  Deps.flush();                                                                             // 2745
                                                                                            // 2746
  // get the three boxes; they should be considered 'labeled' by the patcher and            // 2747
  // not change identities!                                                                 // 2748
  var boxes = nodesToArray(div.node().getElementsByTagName("INPUT"));                       // 2749
                                                                                            // 2750
  test.equal(_.pluck(boxes, 'checked'), [false, false, false]);                             // 2751
                                                                                            // 2752
  // Re-render with first one checked.                                                      // 2753
  Rs.Foo.set(true);                                                                         // 2754
  Deps.flush();                                                                             // 2755
  test.equal(_.pluck(boxes, 'checked'), [true, false, false]);                              // 2756
                                                                                            // 2757
  // Re-render with first one unchecked again.                                              // 2758
  Rs.Foo.set(false);                                                                        // 2759
  Deps.flush();                                                                             // 2760
  test.equal(_.pluck(boxes, 'checked'), [false, false, false]);                             // 2761
                                                                                            // 2762
  // User clicks the second one.                                                            // 2763
  clickElement(boxes[1]);                                                                   // 2764
  test.equal(_.pluck(boxes, 'checked'), [false, true, false]);                              // 2765
  Deps.flush();                                                                             // 2766
  test.equal(_.pluck(boxes, 'checked'), [false, true, false]);                              // 2767
                                                                                            // 2768
  // Re-render with third one checked. Second one should stay checked because               // 2769
  // it's a user update!                                                                    // 2770
  Rs.Baz.set(true);                                                                         // 2771
  Deps.flush();                                                                             // 2772
  test.equal(_.pluck(boxes, 'checked'), [false, true, true]);                               // 2773
                                                                                            // 2774
  // User turns second and third off.                                                       // 2775
  clickElement(boxes[1]);                                                                   // 2776
  clickElement(boxes[2]);                                                                   // 2777
  test.equal(_.pluck(boxes, 'checked'), [false, false, false]);                             // 2778
  Deps.flush();                                                                             // 2779
  test.equal(_.pluck(boxes, 'checked'), [false, false, false]);                             // 2780
                                                                                            // 2781
  // Re-render with first one checked. Third should stay off because it's a user            // 2782
  // update!                                                                                // 2783
  Rs.Foo.set(true);                                                                         // 2784
  Deps.flush();                                                                             // 2785
  test.equal(_.pluck(boxes, 'checked'), [true, false, false]);                              // 2786
                                                                                            // 2787
  // Re-render with first one unchecked. Third should still stay off.                       // 2788
  Rs.Foo.set(false);                                                                        // 2789
  Deps.flush();                                                                             // 2790
  test.equal(_.pluck(boxes, 'checked'), [false, false, false]);                             // 2791
                                                                                            // 2792
  div.kill();                                                                               // 2793
});                                                                                         // 2794
                                                                                            // 2795
_.each(['textarea', 'text', 'password', 'submit', 'button',                                 // 2796
        'reset', 'select', 'hidden'], function (type) {                                     // 2797
  Tinytest.add("spark - controls - " + type, function(test) {                               // 2798
    var R = ReactiveVar({x:"test"});                                                        // 2799
    var R2 = ReactiveVar("");                                                               // 2800
    var div = OnscreenDiv(renderWithPreservation(function() {                               // 2801
      // Re-render when R2 is changed, even though it doesn't affect HTML.                  // 2802
      R2.get();                                                                             // 2803
      if (type === 'textarea') {                                                            // 2804
        return '<textarea id="someId">This is a ' + R.get().x + '</textarea>';              // 2805
      } else if (type === 'select') {                                                       // 2806
        var options = ['This is a test', 'This is a fridge',                                // 2807
                       'This is a frog', 'foobar', 'This is a photograph',                  // 2808
                       'This is a monkey', 'This is a donkey'];                             // 2809
        return '<select id="someId">' + _.map(options, function (o) {                       // 2810
          var maybeSel = ('This is a ' + R.get().x) === o ? 'selected' : '';                // 2811
          return '<option ' + maybeSel + '>' + o + '</option>';                             // 2812
        }).join('') + '</select>';                                                          // 2813
      } else {                                                                              // 2814
        return '<input type="' + type + '" id="someId" value="This is a ' +                 // 2815
          R.get().x + '">';                                                                 // 2816
      }                                                                                     // 2817
    }));                                                                                    // 2818
    div.show(true);                                                                         // 2819
    var canFocus = (type !== 'hidden');                                                     // 2820
                                                                                            // 2821
    var input = div.node().firstChild;                                                      // 2822
    if (type === 'textarea' || type === 'select') {                                         // 2823
      test.equal(input.nodeName, type.toUpperCase());                                       // 2824
    } else {                                                                                // 2825
      test.equal(input.nodeName, 'INPUT');                                                  // 2826
      test.equal(input.type, type);                                                         // 2827
    }                                                                                       // 2828
    test.equal(DomUtils.getElementValue(input), "This is a test");                          // 2829
    test.equal(input._sparkOriginalRenderedValue, ["This is a test"]);                      // 2830
                                                                                            // 2831
    // value updates reactively                                                             // 2832
    R.set({x:"fridge"});                                                                    // 2833
    Deps.flush();                                                                           // 2834
    test.equal(DomUtils.getElementValue(input), "This is a fridge");                        // 2835
    test.equal(input._sparkOriginalRenderedValue, ["This is a fridge"]);                    // 2836
                                                                                            // 2837
    if (canFocus) {                                                                         // 2838
      // ...unless focused                                                                  // 2839
      focusElement(input);                                                                  // 2840
      R.set({x:"frog"});                                                                    // 2841
      Deps.flush();                                                                         // 2842
      test.equal(DomUtils.getElementValue(input), "This is a fridge");                      // 2843
      test.equal(input._sparkOriginalRenderedValue, ["This is a fridge"]);                  // 2844
                                                                                            // 2845
      // blurring and re-setting works                                                      // 2846
      blurElement(input);                                                                   // 2847
      Deps.flush();                                                                         // 2848
      test.equal(DomUtils.getElementValue(input), "This is a fridge");                      // 2849
      test.equal(input._sparkOriginalRenderedValue, ["This is a fridge"]);                  // 2850
    }                                                                                       // 2851
    R.set({x:"frog"});                                                                      // 2852
    Deps.flush();                                                                           // 2853
    test.equal(DomUtils.getElementValue(input), "This is a frog");                          // 2854
    test.equal(input._sparkOriginalRenderedValue, ["This is a frog"]);                      // 2855
                                                                                            // 2856
    // Setting a value (similar to user typing) should prevent value from being             // 2857
    // reverted if the div is re-rendered but the rendered value (ie, R) does               // 2858
    // not change.                                                                          // 2859
    DomUtils.setElementValue(input, "foobar");                                              // 2860
    R2.set("change");                                                                       // 2861
    Deps.flush();                                                                           // 2862
    test.equal(DomUtils.getElementValue(input), "foobar");                                  // 2863
    test.equal(input._sparkOriginalRenderedValue, ["This is a frog"]);                      // 2864
                                                                                            // 2865
    // ... but if the actual rendered value changes, that should take effect.               // 2866
    R.set({x:"photograph"});                                                                // 2867
    Deps.flush();                                                                           // 2868
    test.equal(DomUtils.getElementValue(input), "This is a photograph");                    // 2869
    test.equal(input._sparkOriginalRenderedValue, ["This is a photograph"]);                // 2870
                                                                                            // 2871
    // If the rendered value and user value change in the same way (eg, the user            // 2872
    // changed it and then invoked a menthod that set the database value based              // 2873
    // on what they changed), make sure that the _sparkOriginalRenderedValue                // 2874
    // gets updated too.                                                                    // 2875
    DomUtils.setElementValue(input, "This is a monkey");                                    // 2876
    R.set({x:"monkey"});                                                                    // 2877
    Deps.flush();                                                                           // 2878
    test.equal(DomUtils.getElementValue(input), "This is a monkey");                        // 2879
    test.equal(input._sparkOriginalRenderedValue, ["This is a monkey"]);                    // 2880
                                                                                            // 2881
    if (canFocus) {                                                                         // 2882
      // The same as the previous test... except make sure that it still works              // 2883
      // if the input is focused. ie, imagine that the user edited the field and            // 2884
      // hit enter with the field still focused, updating the database to match             // 2885
      // the field and keeping the field focused.                                           // 2886
      DomUtils.setElementValue(input, "This is a donkey");                                  // 2887
      focusElement(input);                                                                  // 2888
      R.set({x:"donkey"});                                                                  // 2889
      Deps.flush();                                                                         // 2890
      test.equal(DomUtils.getElementValue(input), "This is a donkey");                      // 2891
      test.equal(input._sparkOriginalRenderedValue, ["This is a donkey"]);                  // 2892
    }                                                                                       // 2893
                                                                                            // 2894
    div.kill();                                                                             // 2895
  });                                                                                       // 2896
});                                                                                         // 2897
                                                                                            // 2898
Tinytest.add("spark - oldschool landmark matching", function(test) {                        // 2899
                                                                                            // 2900
  // basic created / onscreen / offscreen callback flow                                     // 2901
  // (ported from old chunk-matching API)                                                   // 2902
                                                                                            // 2903
  var buf;                                                                                  // 2904
  var counts;                                                                               // 2905
                                                                                            // 2906
  var testCallbacks = function(theNum /*, extend opts*/) {                                  // 2907
    return _.extend.apply(_, [{                                                             // 2908
      created: function() {                                                                 // 2909
        this.num = String(theNum);                                                          // 2910
        var howManyBefore = counts[this.num] || 0;                                          // 2911
        counts[this.num] = howManyBefore + 1;                                               // 2912
        for(var i=0;i<howManyBefore;i++)                                                    // 2913
          this.num += "*"; // add stars                                                     // 2914
        buf.push("c"+this.num);                                                             // 2915
      },                                                                                    // 2916
      rendered: function(start, end, range) {                                               // 2917
        buf.push("r"+this.num);                                                             // 2918
      },                                                                                    // 2919
      destroyed: function() {                                                               // 2920
        buf.push("d"+this.num);                                                             // 2921
      }                                                                                     // 2922
    }].concat(_.toArray(arguments).slice(1)));                                              // 2923
  };                                                                                        // 2924
                                                                                            // 2925
  buf = [];                                                                                 // 2926
  counts = {};                                                                              // 2927
  var R = ReactiveVar("A");                                                                 // 2928
  var div = OnscreenDiv(Meteor.render(function() {                                          // 2929
    var html = Spark.createLandmark(testCallbacks(0), function () {                         // 2930
      return String(R.get());                                                               // 2931
    });                                                                                     // 2932
    return html;                                                                            // 2933
  }, testCallbacks(0)));                                                                    // 2934
                                                                                            // 2935
  test.equal(buf, ["c0"]);                                                                  // 2936
                                                                                            // 2937
  test.equal(div.html(), "A");                                                              // 2938
  Deps.flush();                                                                             // 2939
  test.equal(buf, ["c0", "r0"]);                                                            // 2940
  test.equal(div.html(), "A");                                                              // 2941
                                                                                            // 2942
  R.set("B");                                                                               // 2943
  Deps.flush();                                                                             // 2944
  test.equal(buf, ["c0", "r0", "r0"]);                                                      // 2945
  test.equal(div.html(), "B");                                                              // 2946
                                                                                            // 2947
                                                                                            // 2948
  div.kill();                                                                               // 2949
  Deps.flush();                                                                             // 2950
  test.equal(buf, ["c0", "r0", "r0", "d0"]);                                                // 2951
                                                                                            // 2952
  // with a branch                                                                          // 2953
                                                                                            // 2954
  buf = [];                                                                                 // 2955
  counts = {};                                                                              // 2956
  R = ReactiveVar("A");                                                                     // 2957
  div = OnscreenDiv(Meteor.render(function() {                                              // 2958
    R.get();                                                                                // 2959
    return Spark.createLandmark(testCallbacks(0), function () {                             // 2960
      var html = Spark.labelBranch("foo", function () {                                     // 2961
        return Spark.createLandmark(testCallbacks(1),                                       // 2962
                                    function () { return "HI"; });                          // 2963
      });                                                                                   // 2964
      return "<div>" + html + "</div>";                                                     // 2965
    });                                                                                     // 2966
  }));                                                                                      // 2967
                                                                                            // 2968
  test.equal(buf, ["c0", "c1"]);                                                            // 2969
  Deps.flush();                                                                             // 2970
  // what order of chunks {0,1} is preferable??                                             // 2971
  // should be consistent but I'm not sure what makes most sense.                           // 2972
  test.equal(buf, "c0,c1,r1,r0".split(','));                                                // 2973
  buf.length = 0;                                                                           // 2974
                                                                                            // 2975
  R.set("B");                                                                               // 2976
  Deps.flush();                                                                             // 2977
  test.equal(buf, "r1,r0".split(','));                                                      // 2978
  buf.length = 0;                                                                           // 2979
                                                                                            // 2980
  div.kill();                                                                               // 2981
  Deps.flush();                                                                             // 2982
  buf.sort();                                                                               // 2983
  test.equal(buf, "d0,d1".split(','));                                                      // 2984
});                                                                                         // 2985
                                                                                            // 2986
                                                                                            // 2987
Tinytest.add("spark - oldschool branch keys", function(test) {                              // 2988
                                                                                            // 2989
  var R, div;                                                                               // 2990
                                                                                            // 2991
  // Re-rendered Meteor.render keeps same landmark state                                    // 2992
                                                                                            // 2993
  var objs = [];                                                                            // 2994
  R = ReactiveVar("foo");                                                                   // 2995
  div = OnscreenDiv(Meteor.render(function() {                                              // 2996
    return Spark.createLandmark({                                                           // 2997
      rendered: function () { objs.push(true); }                                            // 2998
    }, function () { return R.get(); });                                                    // 2999
  }));                                                                                      // 3000
                                                                                            // 3001
  Deps.flush();                                                                             // 3002
  R.set("bar");                                                                             // 3003
  Deps.flush();                                                                             // 3004
  R.set("baz");                                                                             // 3005
  Deps.flush();                                                                             // 3006
                                                                                            // 3007
  test.equal(objs.length, 3);                                                               // 3008
  test.isTrue(objs[0] === objs[1]);                                                         // 3009
  test.isTrue(objs[1] === objs[2]);                                                         // 3010
                                                                                            // 3011
  div.kill();                                                                               // 3012
  Deps.flush();                                                                             // 3013
                                                                                            // 3014
  // track chunk matching / re-rendering in detail                                          // 3015
                                                                                            // 3016
  var buf;                                                                                  // 3017
  var counts;                                                                               // 3018
                                                                                            // 3019
  var testCallbacks = function(theNum /*, extend opts*/) {                                  // 3020
    return _.extend.apply(_, [{                                                             // 3021
      created: function() {                                                                 // 3022
        this.num = String(theNum);                                                          // 3023
        var howManyBefore = counts[this.num] || 0;                                          // 3024
        counts[this.num] = howManyBefore + 1;                                               // 3025
        for(var i=0;i<howManyBefore;i++)                                                    // 3026
          this.num += "*"; // add stars                                                     // 3027
        buf.push("c"+this.num);                                                             // 3028
      },                                                                                    // 3029
      rendered: function(start, end, range) {                                               // 3030
        buf.push("on"+this.num);                                                            // 3031
      },                                                                                    // 3032
      destroyed: function() {                                                               // 3033
        buf.push("off"+this.num);                                                           // 3034
      }                                                                                     // 3035
    }].concat(_.toArray(arguments).slice(1)));                                              // 3036
  };                                                                                        // 3037
                                                                                            // 3038
  var counter = 1;                                                                          // 3039
  var chunk = function(contents, num, branch) {                                             // 3040
    if (branch === null)                                                                    // 3041
      branch = "unique_branch_" + (counter++);                                              // 3042
                                                                                            // 3043
    return Spark.labelBranch(branch, function () {                                          // 3044
      return Spark.createLandmark(                                                          // 3045
        testCallbacks(num),                                                                 // 3046
        function () {                                                                       // 3047
          if (typeof contents === "string")                                                 // 3048
            return contents;                                                                // 3049
          else if (_.isArray(contents))                                                     // 3050
            return _.map(contents, function(x) {                                            // 3051
              if (typeof x === 'string')                                                    // 3052
                return x;                                                                   // 3053
              return chunk(x[0], x[1], x[2]);                                               // 3054
            }).join('');                                                                    // 3055
          else                                                                              // 3056
            return contents();                                                              // 3057
        });                                                                                 // 3058
    });                                                                                     // 3059
  };                                                                                        // 3060
                                                                                            // 3061
  ///// Chunk 1 contains 2,3,4, all should be matched                                       // 3062
                                                                                            // 3063
  buf = [];                                                                                 // 3064
  counts = {};                                                                              // 3065
                                                                                            // 3066
  R = ReactiveVar("foo");                                                                   // 3067
  div = OnscreenDiv(Meteor.render(function() {                                              // 3068
    if (R.get() === 'nothing')                                                              // 3069
      return "no chunk!";                                                                   // 3070
    else                                                                                    // 3071
      return chunk([['<span>apple</span>', 2, 'x'],                                         // 3072
                    ['<span>banana</span>', 3, 'y'],                                        // 3073
                    ['<span>kiwi</span>', 4, 'z']                                           // 3074
                   ], 1, 'fruit');                                                          // 3075
  }));                                                                                      // 3076
                                                                                            // 3077
  Deps.flush();                                                                             // 3078
  buf.sort();                                                                               // 3079
  test.equal(buf, ['c1', 'c2', 'c3', 'c4', 'on1', 'on2', 'on3', 'on4']);                    // 3080
  buf.length = 0;                                                                           // 3081
                                                                                            // 3082
  R.set("bar");                                                                             // 3083
  Deps.flush();                                                                             // 3084
  buf.sort();                                                                               // 3085
  test.equal(buf, ['on1', 'on2', 'on3', 'on4']);                                            // 3086
  buf.length = 0;                                                                           // 3087
                                                                                            // 3088
  R.set("nothing");                                                                         // 3089
  Deps.flush();                                                                             // 3090
  buf.sort();                                                                               // 3091
  test.equal(buf, ['off1', 'off2', 'off3', 'off4']);                                        // 3092
  buf.length = 0;                                                                           // 3093
                                                                                            // 3094
  div.kill();                                                                               // 3095
  Deps.flush();                                                                             // 3096
                                                                                            // 3097
  ///// Chunk 3 has no branch key, should be recreated                                      // 3098
                                                                                            // 3099
  buf = [];                                                                                 // 3100
  counts = {};                                                                              // 3101
                                                                                            // 3102
  R = ReactiveVar("foo");                                                                   // 3103
  div = OnscreenDiv(Meteor.render(function() {                                              // 3104
    if (R.get() === 'nothing')                                                              // 3105
      return "no chunk!";                                                                   // 3106
    else                                                                                    // 3107
      return chunk([['<span>apple</span>', 2, 'x'],                                         // 3108
                    ['<span>banana</span>', 3, null],                                       // 3109
                    ['<span>kiwi</span>', 4, 'z']                                           // 3110
                   ], 1, 'fruit');                                                          // 3111
  }));                                                                                      // 3112
                                                                                            // 3113
  Deps.flush();                                                                             // 3114
  buf.sort();                                                                               // 3115
  test.equal(buf, ['c1', 'c2', 'c3', 'c4', 'on1', 'on2', 'on3', 'on4']);                    // 3116
  buf.length = 0;                                                                           // 3117
                                                                                            // 3118
  R.set("bar");                                                                             // 3119
  Deps.flush();                                                                             // 3120
  buf.sort();                                                                               // 3121
  test.equal(buf, ['c3*', 'off3', 'on1', 'on2', 'on3*', 'on4']);                            // 3122
  buf.length = 0;                                                                           // 3123
                                                                                            // 3124
  div.kill();                                                                               // 3125
  Deps.flush();                                                                             // 3126
  buf.sort();                                                                               // 3127
  // killing the div should have given us offscreen calls for 1,2,3*,4                      // 3128
  test.equal(buf, ['off1', 'off2', 'off3*', 'off4']);                                       // 3129
  buf.length = 0;                                                                           // 3130
                                                                                            // 3131
                                                                                            // 3132
  // XXX test intermediate unkeyed chunks;                                                  // 3133
  // duplicate branch keys; different order                                                 // 3134
});                                                                                         // 3135
                                                                                            // 3136
Tinytest.add("spark - isolate inside landmark", function (test) {                           // 3137
                                                                                            // 3138
  // test that preservation maps from all landmarks are honored when                        // 3139
  // an isolate is re-rendered, even the landmarks that are outside                         // 3140
  // the isolate and therefore not involved in the re-render.                               // 3141
                                                                                            // 3142
  var R = ReactiveVar(1);                                                                   // 3143
  var d = OnscreenDiv(Spark.render(function () {                                            // 3144
    return Spark.createLandmark(                                                            // 3145
      { preserve: ['.foo'] },                                                               // 3146
      function () {                                                                         // 3147
        return Spark.isolate(function () {                                                  // 3148
          return '<hr class="foo"/>' + R.get();                                             // 3149
        });                                                                                 // 3150
      });                                                                                   // 3151
  }));                                                                                      // 3152
                                                                                            // 3153
  var foo1 = d.node().firstChild;                                                           // 3154
  test.equal(d.node().firstChild.nextSibling.nodeValue, '1');                               // 3155
  R.set(2);                                                                                 // 3156
  Deps.flush();                                                                             // 3157
  var foo2 = d.node().firstChild;                                                           // 3158
  test.equal(d.node().firstChild.nextSibling.nodeValue, '2');                               // 3159
  test.isTrue(foo1 === foo2);                                                               // 3160
  d.kill();                                                                                 // 3161
  Deps.flush();                                                                             // 3162
                                                                                            // 3163
  // test that selectors in a landmark preservation map are resolved                        // 3164
  // relative to the landmark, not relative to the re-rendered                              // 3165
  // fragment.  the selector may refer to nodes that are outside the                        // 3166
  // re-rendered fragment, and the selector will still match.                               // 3167
                                                                                            // 3168
  R = ReactiveVar(1);                                                                       // 3169
  d = OnscreenDiv(Spark.render(function () {                                                // 3170
    return Spark.createLandmark(                                                            // 3171
      { preserve: ['div .foo'] },                                                           // 3172
      function () {                                                                         // 3173
        return "<div>"+Spark.isolate(function () {                                          // 3174
          return '<hr class="foo"/>' + R.get();                                             // 3175
        })+"</div>";                                                                        // 3176
      });                                                                                   // 3177
  }));                                                                                      // 3178
                                                                                            // 3179
  var foo1 = DomUtils.find(d.node(), '.foo');                                               // 3180
  test.equal(foo1.nodeName, 'HR');                                                          // 3181
  test.equal(foo1.nextSibling.nodeValue, '1');                                              // 3182
  R.set(2);                                                                                 // 3183
  Deps.flush();                                                                             // 3184
  var foo2 = DomUtils.find(d.node(), '.foo');                                               // 3185
  test.equal(foo2.nodeName, 'HR');                                                          // 3186
  test.equal(foo2.nextSibling.nodeValue, '2');                                              // 3187
  test.isTrue(foo1 === foo2);                                                               // 3188
  d.kill();                                                                                 // 3189
  Deps.flush();                                                                             // 3190
});                                                                                         // 3191
                                                                                            // 3192
Tinytest.add("spark - nested onscreen processing", function (test) {                        // 3193
  var cursor = {                                                                            // 3194
    observeChanges: function () { return { stop: function () {} }; }                        // 3195
  };                                                                                        // 3196
                                                                                            // 3197
  var x = [];                                                                               // 3198
  var d = OnscreenDiv(Spark.render(function () {                                            // 3199
    return Spark.list(cursor, function () {}, function () {                                 // 3200
      return Spark.list(cursor, function () {}, function () {                               // 3201
        return Spark.list(cursor, function () {}, function () {                             // 3202
          return Spark.createLandmark({                                                     // 3203
            created: function () { x.push('c'); },                                          // 3204
            rendered: function () { x.push('r'); },                                         // 3205
            destroyed: function () { x.push('d'); }                                         // 3206
          }, function () { return "hi"; });                                                 // 3207
        });                                                                                 // 3208
      });                                                                                   // 3209
    });                                                                                     // 3210
  }));                                                                                      // 3211
                                                                                            // 3212
  Deps.flush();                                                                             // 3213
  test.equal(x.join(''), 'cr');                                                             // 3214
  x = [];                                                                                   // 3215
  d.kill();                                                                                 // 3216
  Deps.flush();                                                                             // 3217
  test.equal(x.join(''), 'd');                                                              // 3218
});                                                                                         // 3219
                                                                                            // 3220
Tinytest.add("spark - current landmark", function (test) {                                  // 3221
  var R = ReactiveVar(1);                                                                   // 3222
  var callbacks = 0;                                                                        // 3223
  var d = OnscreenDiv(Meteor.render(function () {                                           // 3224
    var html = Spark.createLandmark({                                                       // 3225
      created: function () {                                                                // 3226
        this.a = 1;                                                                         // 3227
        this.renderCount = 0;                                                               // 3228
        test.isFalse('b' in this);                                                          // 3229
        callbacks++;                                                                        // 3230
      },                                                                                    // 3231
      rendered: function () {                                                               // 3232
        test.equal(this.a, 9);                                                              // 3233
        test.equal(this.b, 2);                                                              // 3234
        if (this.renderCount === 0)                                                         // 3235
          test.isFalse('c' in this);                                                        // 3236
        else                                                                                // 3237
          test.isTrue('c' in this);                                                         // 3238
        this.renderCount++;                                                                 // 3239
        callbacks++;                                                                        // 3240
      },                                                                                    // 3241
      destroyed: function () {                                                              // 3242
        test.equal(this.a, 9);                                                              // 3243
        test.equal(this.b, 2);                                                              // 3244
        test.equal(this.c, 3);                                                              // 3245
        callbacks++;                                                                        // 3246
      }                                                                                     // 3247
    }, function (lm) {                                                                      // 3248
      var html = '<span>hi</span>';                                                         // 3249
                                                                                            // 3250
      if (R.get() === 1) {                                                                  // 3251
        test.equal(callbacks, 1);                                                           // 3252
        test.equal(lm.a, 1);                                                                // 3253
        lm.a = 9;                                                                           // 3254
        lm.b = 2;                                                                           // 3255
        test.isFalse('c' in lm);                                                            // 3256
        test.equal(callbacks, 1);                                                           // 3257
        lm = null;                                                                          // 3258
      }                                                                                     // 3259
                                                                                            // 3260
      if (R.get() === 2) {                                                                  // 3261
        test.equal(callbacks, 2);                                                           // 3262
        test.equal(lm.a, 9);                                                                // 3263
        test.equal(lm.b, 2);                                                                // 3264
        test.equal(lm.c, 3);                                                                // 3265
        test.equal(lm.renderCount, 1);                                                      // 3266
      }                                                                                     // 3267
                                                                                            // 3268
      return html;                                                                          // 3269
    });                                                                                     // 3270
                                                                                            // 3271
                                                                                            // 3272
    if (R.get() >= 3) {                                                                     // 3273
      html += Spark.labelBranch('branch', function () {                                     // 3274
        var html = Spark.createLandmark({                                                   // 3275
          created: function () {                                                            // 3276
            this.outer = true;                                                              // 3277
          },                                                                                // 3278
          rendered: function () {                                                           // 3279
            this.renderCount = (this.renderCount || 0) + 1;                                 // 3280
          }                                                                                 // 3281
        }, function (lm) {                                                                  // 3282
          var html = '<span>outer</span>';                                                  // 3283
          test.isTrue(lm.outer);                                                            // 3284
          test.equal(R.get() - 3, lm.renderCount || 0);                                     // 3285
          html += Spark.labelBranch("a", function () {                                      // 3286
            var html = Spark.createLandmark({                                               // 3287
              created: function () {                                                        // 3288
                this.innerA = true;                                                         // 3289
              },                                                                            // 3290
              rendered: function () {                                                       // 3291
                this.renderCount = (this.renderCount || 0) + 1;                             // 3292
              }                                                                             // 3293
            }, function (lm) {                                                              // 3294
              var html = '<span>innerA</span>';                                             // 3295
              test.isTrue(lm.innerA);                                                       // 3296
              return html;                                                                  // 3297
            });                                                                             // 3298
            return html;                                                                    // 3299
          });                                                                               // 3300
          return html;                                                                      // 3301
        });                                                                                 // 3302
                                                                                            // 3303
        if (R.get() === 3 || R.get() >= 5) {                                                // 3304
          html += Spark.labelBranch("b", function () {                                      // 3305
            var html = Spark.createLandmark({                                               // 3306
              created: function () {                                                        // 3307
                this.innerB = true;                                                         // 3308
              },                                                                            // 3309
              rendered: function () {                                                       // 3310
                this.renderCount = (this.renderCount || 0) + 1;                             // 3311
              }                                                                             // 3312
            }, function (lm) {                                                              // 3313
              var html = '<span>innerB</span>';                                             // 3314
              test.isTrue(lm.innerB);                                                       // 3315
              test.equal(R.get() === 3 ? 0 : R.get() - 5,                                   // 3316
                         lm.renderCount || 0);                                              // 3317
              return html;                                                                  // 3318
            });                                                                             // 3319
            return html;                                                                    // 3320
          });                                                                               // 3321
        }                                                                                   // 3322
        return html;                                                                        // 3323
      });                                                                                   // 3324
    }                                                                                       // 3325
    return html;                                                                            // 3326
  }));                                                                                      // 3327
                                                                                            // 3328
  var findOuter = function () {                                                             // 3329
    return d.node().firstChild.nextSibling;                                                 // 3330
  };                                                                                        // 3331
                                                                                            // 3332
  var findInnerA = function () {                                                            // 3333
    return findOuter().nextSibling;                                                         // 3334
  };                                                                                        // 3335
                                                                                            // 3336
  var findInnerB = function () {                                                            // 3337
    return findInnerA().nextSibling;                                                        // 3338
  };                                                                                        // 3339
                                                                                            // 3340
  test.equal(callbacks, 1);                                                                 // 3341
  Deps.flush();                                                                             // 3342
  test.equal(callbacks, 2);                                                                 // 3343
  test.equal(null, SparkTest.getEnclosingLandmark(d.node()));                               // 3344
  var enc = SparkTest.getEnclosingLandmark(d.node().firstChild);                            // 3345
  test.equal(enc.a, 9);                                                                     // 3346
  test.equal(enc.b, 2);                                                                     // 3347
  test.isFalse('c' in enc);                                                                 // 3348
  enc.c = 3;                                                                                // 3349
  Deps.flush();                                                                             // 3350
  test.equal(callbacks, 2);                                                                 // 3351
                                                                                            // 3352
  R.set(2)                                                                                  // 3353
  Deps.flush();                                                                             // 3354
  test.equal(callbacks, 3);                                                                 // 3355
                                                                                            // 3356
  R.set(3)                                                                                  // 3357
  Deps.flush();                                                                             // 3358
  test.equal(callbacks, 4);                                                                 // 3359
                                                                                            // 3360
  test.isTrue(SparkTest.getEnclosingLandmark(findOuter()).outer);                           // 3361
  test.isTrue(SparkTest.getEnclosingLandmark(findInnerA()).innerA);                         // 3362
  test.isTrue(SparkTest.getEnclosingLandmark(findInnerB()).innerB);                         // 3363
  test.equal(1, SparkTest.getEnclosingLandmark(findOuter()).renderCount);                   // 3364
  test.equal(1, SparkTest.getEnclosingLandmark(findInnerA()).renderCount);                  // 3365
  test.equal(1, SparkTest.getEnclosingLandmark(findInnerB()).renderCount);                  // 3366
                                                                                            // 3367
  R.set(4)                                                                                  // 3368
  Deps.flush();                                                                             // 3369
  test.equal(callbacks, 5);                                                                 // 3370
  test.equal(2, SparkTest.getEnclosingLandmark(findOuter()).renderCount);                   // 3371
  test.equal(2, SparkTest.getEnclosingLandmark(findInnerA()).renderCount);                  // 3372
                                                                                            // 3373
  R.set(5)                                                                                  // 3374
  Deps.flush();                                                                             // 3375
  test.equal(callbacks, 6);                                                                 // 3376
  test.equal(3, SparkTest.getEnclosingLandmark(findOuter()).renderCount);                   // 3377
  test.equal(3, SparkTest.getEnclosingLandmark(findInnerA()).renderCount);                  // 3378
  test.equal(1, SparkTest.getEnclosingLandmark(findInnerB()).renderCount);                  // 3379
                                                                                            // 3380
  R.set(6)                                                                                  // 3381
  Deps.flush();                                                                             // 3382
  test.equal(callbacks, 7);                                                                 // 3383
  test.equal(4, SparkTest.getEnclosingLandmark(findOuter()).renderCount);                   // 3384
  test.equal(4, SparkTest.getEnclosingLandmark(findInnerA()).renderCount);                  // 3385
  test.equal(2, SparkTest.getEnclosingLandmark(findInnerB()).renderCount);                  // 3386
                                                                                            // 3387
  d.kill();                                                                                 // 3388
  Deps.flush();                                                                             // 3389
  test.equal(callbacks, 8);                                                                 // 3390
                                                                                            // 3391
  Deps.flush();                                                                             // 3392
  test.equal(callbacks, 8);                                                                 // 3393
});                                                                                         // 3394
                                                                                            // 3395
Tinytest.add("spark - find/findAll on landmark", function (test) {                          // 3396
  var l1, l2;                                                                               // 3397
  var R = ReactiveVar(1);                                                                   // 3398
                                                                                            // 3399
  var d = OnscreenDiv(Spark.render(function () {                                            // 3400
    return "<div id=1>k</div><div id=2>" +                                                  // 3401
      Spark.labelBranch("a", function () {                                                  // 3402
        return Spark.createLandmark({                                                       // 3403
          created: function () {                                                            // 3404
            test.instanceOf(this, Spark.Landmark);                                          // 3405
            if (l1)                                                                         // 3406
              test.equal(l1, this);                                                         // 3407
            l1 = this;                                                                      // 3408
          }                                                                                 // 3409
        }, function () {                                                                    // 3410
          return "<span class='a' id=3>a" +                                                 // 3411
            Spark.labelBranch("b", function () {                                            // 3412
              return Spark.isolate(                                                         // 3413
                function () {                                                               // 3414
                  R.get();                                                                  // 3415
                  return Spark.createLandmark(                                              // 3416
                    {                                                                       // 3417
                      created: function () {                                                // 3418
                        test.instanceOf(this, Spark.Landmark);                              // 3419
                        if (l2)                                                             // 3420
                          test.equal(l2, this);                                             // 3421
                        l2 = this;                                                          // 3422
                      }                                                                     // 3423
                    }, function () {                                                        // 3424
                      return "<span class='b' id=4>b4</span>" +                             // 3425
                        "<span class='b' id=6>b6</span>";                                   // 3426
                    });                                                                     // 3427
                });                                                                         // 3428
            }) + "</span>";                                                                 // 3429
        });                                                                                 // 3430
      }) + "<span class='c' id=5>c</span></div>";                                           // 3431
  }));                                                                                      // 3432
                                                                                            // 3433
  var ids = function (nodes) {                                                              // 3434
    if (!(nodes instanceof Array))                                                          // 3435
      nodes = nodes ? [nodes] : [];                                                         // 3436
    return _.pluck(nodes, 'id').join('');                                                   // 3437
  };                                                                                        // 3438
                                                                                            // 3439
  var check = function (all) {                                                              // 3440
    var f = all ? 'findAll' : 'find';                                                       // 3441
                                                                                            // 3442
    test.equal(ids(l1[f]('.kitten')), '');                                                  // 3443
    test.equal(ids(l2[f]('.kitten')), '');                                                  // 3444
                                                                                            // 3445
    test.equal(ids(l1[f]('.a')), '3');                                                      // 3446
    test.equal(ids(l2[f]('.a')), '');                                                       // 3447
                                                                                            // 3448
    test.equal(ids(l1[f]('.b')), all ? '46' : '4');                                         // 3449
    test.equal(ids(l2[f]('.b')), all ? '46' : '4');                                         // 3450
                                                                                            // 3451
    test.equal(ids(l1[f]('.c')), '');                                                       // 3452
    test.equal(ids(l2[f]('.c')), '');                                                       // 3453
                                                                                            // 3454
    test.equal(ids(l1[f]('.a .b')), all ? '46' : '4');                                      // 3455
    test.equal(ids(l2[f]('.a .b')), '');                                                    // 3456
  };                                                                                        // 3457
                                                                                            // 3458
  check(false);                                                                             // 3459
  check(true);                                                                              // 3460
  R.set(2);                                                                                 // 3461
  Deps.flush();                                                                             // 3462
  check(false);                                                                             // 3463
  check(true);                                                                              // 3464
                                                                                            // 3465
  d.kill();                                                                                 // 3466
  Deps.flush();                                                                             // 3467
});                                                                                         // 3468
                                                                                            // 3469
Tinytest.add("spark - landmark clean-up", function (test) {                                 // 3470
                                                                                            // 3471
  var crd;                                                                                  // 3472
  var makeCrd = function () {                                                               // 3473
    var crd = [0,0,0];                                                                      // 3474
    crd.callbacks = {                                                                       // 3475
      created: function () { crd[0]++; },                                                   // 3476
      rendered: function () { crd[1]++; },                                                  // 3477
      destroyed: function () { crd[2]++; }                                                  // 3478
    };                                                                                      // 3479
    return crd;                                                                             // 3480
  };                                                                                        // 3481
                                                                                            // 3482
  // not inside render                                                                      // 3483
  crd = makeCrd();                                                                          // 3484
  Spark.createLandmark(crd.callbacks, function () { return 'hi'; });                        // 3485
  test.equal(crd, [1,0,1]);                                                                 // 3486
                                                                                            // 3487
  // landmark never materialized                                                            // 3488
  crd = makeCrd();                                                                          // 3489
  Spark.render(function() {                                                                 // 3490
    var html =                                                                              // 3491
          Spark.createLandmark(crd.callbacks, function () { return 'hi'; });                // 3492
    return '';                                                                              // 3493
  });                                                                                       // 3494
  test.equal(crd, [1,0,1]);                                                                 // 3495
  Deps.flush();                                                                             // 3496
  test.equal(crd, [1,0,1]);                                                                 // 3497
                                                                                            // 3498
  // two landmarks, only one materialized at a time.                                        // 3499
  // one replaces the other                                                                 // 3500
  var crd1 = makeCrd();                                                                     // 3501
  var crd2 = makeCrd();                                                                     // 3502
  var R = ReactiveVar(1);                                                                   // 3503
  var div = OnscreenDiv(Meteor.render(function() {                                          // 3504
    return (R.get() === 1 ?                                                                 // 3505
            Spark.createLandmark(crd1.callbacks, function() { return 'hi'; }) :             // 3506
            Spark.createLandmark(crd2.callbacks, function() { return 'hi'; }));             // 3507
  }));                                                                                      // 3508
  test.equal(crd1, [1,0,0]); // created                                                     // 3509
  test.equal(crd2, [0,0,0]);                                                                // 3510
  Deps.flush();                                                                             // 3511
  test.equal(crd1, [1,1,0]); // rendered                                                    // 3512
  test.equal(crd2, [0,0,0]);                                                                // 3513
  R.set(2);                                                                                 // 3514
  Deps.flush();                                                                             // 3515
  test.equal(crd1, [1,1,0]); // not destroyed (callback replaced)                           // 3516
  test.equal(crd2, [0,1,0]); // matched                                                     // 3517
                                                                                            // 3518
  div.kill();                                                                               // 3519
  Deps.flush();                                                                             // 3520
  test.equal(crd1, [1,1,0]);                                                                // 3521
  test.equal(crd2, [0,1,1]); // destroyed                                                   // 3522
});                                                                                         // 3523
                                                                                            // 3524
Tinytest.add("spark - bubbling render", function (test) {                                   // 3525
  var makeCrd = function () {                                                               // 3526
    var crd = [0,0,0];                                                                      // 3527
    crd.callbacks = {                                                                       // 3528
      created: function () { crd[0]++; },                                                   // 3529
      rendered: function () { crd[1]++; },                                                  // 3530
      destroyed: function () { crd[2]++; }                                                  // 3531
    };                                                                                      // 3532
    return crd;                                                                             // 3533
  };                                                                                        // 3534
                                                                                            // 3535
  var crd1 = makeCrd();                                                                     // 3536
  var crd2 = makeCrd();                                                                     // 3537
                                                                                            // 3538
  var R = ReactiveVar('foo');                                                               // 3539
  var div = OnscreenDiv(Spark.render(function () {                                          // 3540
    return Spark.createLandmark(crd1.callbacks, function () {                               // 3541
      return Spark.labelBranch('fred', function () {                                        // 3542
        return Spark.createLandmark(crd2.callbacks, function () {                           // 3543
          return Spark.isolate(function () {                                                // 3544
            return R.get();                                                                 // 3545
          });                                                                               // 3546
        });                                                                                 // 3547
      });                                                                                   // 3548
    });                                                                                     // 3549
  }));                                                                                      // 3550
                                                                                            // 3551
  Deps.flush();                                                                             // 3552
  test.equal(div.html(), 'foo');                                                            // 3553
  test.equal(crd1, [1,1,0]);                                                                // 3554
  test.equal(crd2, [1,1,0]);                                                                // 3555
                                                                                            // 3556
  R.set('bar');                                                                             // 3557
  Deps.flush();                                                                             // 3558
  test.equal(div.html(), 'bar');                                                            // 3559
  test.equal(crd1, [1,2,0]);                                                                // 3560
  test.equal(crd2, [1,2,0]);                                                                // 3561
                                                                                            // 3562
  div.kill();                                                                               // 3563
  Deps.flush();                                                                             // 3564
});                                                                                         // 3565
                                                                                            // 3566
Tinytest.add("spark - landmark arg", function (test) {                                      // 3567
  var div = OnscreenDiv(Spark.render(function () {                                          // 3568
    return Spark.createLandmark({                                                           // 3569
      created: function () {                                                                // 3570
        test.isFalse(this.hasDom());                                                        // 3571
      },                                                                                    // 3572
      rendered: function () {                                                               // 3573
        var landmark = this;                                                                // 3574
        landmark.firstNode().innerHTML = 'Greetings';                                       // 3575
        landmark.lastNode().innerHTML = 'Line';                                             // 3576
        landmark.find('i').innerHTML =                                                      // 3577
          (landmark.findAll('b').length)+"-bold";                                           // 3578
        test.isTrue(landmark.hasDom());                                                     // 3579
      },                                                                                    // 3580
      destroyed: function () {                                                              // 3581
        test.isFalse(this.hasDom());                                                        // 3582
      }                                                                                     // 3583
    }, function () {                                                                        // 3584
      return Spark.attachEvents({                                                           // 3585
        'click': function (event, landmark) {                                               // 3586
          landmark.firstNode().innerHTML = 'Hello';                                         // 3587
          landmark.lastNode().innerHTML = 'World';                                          // 3588
          landmark.find('i').innerHTML =                                                    // 3589
            (landmark.findAll('*').length)+"-element";                                      // 3590
        }                                                                                   // 3591
      }, '<b>Foo</b> <i>Bar</i> <u>Baz</u>');                                               // 3592
    });                                                                                     // 3593
  }));                                                                                      // 3594
                                                                                            // 3595
  test.equal(div.text(), "Foo Bar Baz");                                                    // 3596
  Deps.flush();                                                                             // 3597
  test.equal(div.text(), "Greetings 1-bold Line");                                          // 3598
  clickElement(DomUtils.find(div.node(), 'i'));                                             // 3599
  test.equal(div.text(), "Hello 3-element World");                                          // 3600
                                                                                            // 3601
  div.kill();                                                                               // 3602
  Deps.flush();                                                                             // 3603
});                                                                                         // 3604
                                                                                            // 3605
Tinytest.add("spark - landmark preserve", function (test) {                                 // 3606
  var R = ReactiveVar("foo");                                                               // 3607
                                                                                            // 3608
  var lmhr = function () {                                                                  // 3609
    return Spark.createLandmark({preserve:['hr']}, function () {                            // 3610
      return '<hr/>';                                                                       // 3611
    });                                                                                     // 3612
  };                                                                                        // 3613
                                                                                            // 3614
  var div = OnscreenDiv(Meteor.render(function () {                                         // 3615
    return "<div><span>" + R.get() + "</span>" +                                            // 3616
      Spark.labelBranch('A', lmhr) + Spark.labelBranch('B', lmhr) +                         // 3617
      "</div>";                                                                             // 3618
  }));                                                                                      // 3619
                                                                                            // 3620
  test.equal(div.html(), '<div><span>foo</span><hr><hr></div>');                            // 3621
  var hrs1 = DomUtils.findAll(div.node(), 'hr');                                            // 3622
  R.set("bar");                                                                             // 3623
  Deps.flush();                                                                             // 3624
  test.equal(div.html(), '<div><span>bar</span><hr><hr></div>');                            // 3625
  var hrs2 = DomUtils.findAll(div.node(), 'hr');                                            // 3626
                                                                                            // 3627
  test.isTrue(hrs1[0] === hrs2[0]);                                                         // 3628
  test.isTrue(hrs1[1] === hrs2[1]);                                                         // 3629
                                                                                            // 3630
  div.kill();                                                                               // 3631
  Deps.flush();                                                                             // 3632
});                                                                                         // 3633
                                                                                            // 3634
Tinytest.add("spark - branch annotation is optional", function (test) {                     // 3635
  // test that labelBranch works on HTML that isn't element-balanced                        // 3636
  // and doesn't fail by trying to emit an annotation when it contains                      // 3637
  // no landmarks.                                                                          // 3638
                                                                                            // 3639
  var R = ReactiveVar("foo");                                                               // 3640
                                                                                            // 3641
  var Rget = function () { return R.get(); };                                               // 3642
  var cnst = function (c) { return function () { return c; }; };                            // 3643
  var lmhr = function () {                                                                  // 3644
    return Spark.createLandmark({preserve:['hr']}, function () {                            // 3645
      return '<hr/>';                                                                       // 3646
    });                                                                                     // 3647
  };                                                                                        // 3648
                                                                                            // 3649
  var div = OnscreenDiv(Meteor.render(function () {                                         // 3650
    return '<div class="' + Spark.labelBranch('A', Rget) + '">' +                           // 3651
      Spark.labelBranch('B', cnst('</div><div>')) +                                         // 3652
      Spark.labelBranch('C', lmhr) + Spark.labelBranch('D', lmhr) +                         // 3653
      '</div>';                                                                             // 3654
  }));                                                                                      // 3655
                                                                                            // 3656
  test.equal(div.html(), '<div class="foo"></div><div><hr><hr></div>');                     // 3657
  var div1 = div.node().firstChild;                                                         // 3658
  var hrs1 = DomUtils.findAll(div.node(), 'hr');                                            // 3659
  R.set("bar");                                                                             // 3660
  Deps.flush();                                                                             // 3661
  test.equal(div.html(), '<div class="bar"></div><div><hr><hr></div>');                     // 3662
  var div2 = div.node().firstChild;                                                         // 3663
  var hrs2 = DomUtils.findAll(div.node(), 'hr');                                            // 3664
                                                                                            // 3665
  test.isFalse(div1 === div2);                                                              // 3666
  test.isTrue(hrs1[0] === hrs2[0]);                                                         // 3667
  test.isTrue(hrs1[1] === hrs2[1]);                                                         // 3668
                                                                                            // 3669
  div.kill();                                                                               // 3670
  Deps.flush();                                                                             // 3671
});                                                                                         // 3672
                                                                                            // 3673
Tinytest.add("spark - unique label", function (test) {                                      // 3674
  var buf = [];                                                                             // 3675
  var bufstr = function () {                                                                // 3676
    buf.sort();                                                                             // 3677
    var str = buf.join('');                                                                 // 3678
    buf.length = 0;                                                                         // 3679
    return str;                                                                             // 3680
  };                                                                                        // 3681
                                                                                            // 3682
  var ublm = function () {                                                                  // 3683
    return Spark.labelBranch(Spark.UNIQUE_LABEL, function () {                              // 3684
      return Spark.createLandmark({created: function () { buf.push('c'); },                 // 3685
                                   rendered: function () { buf.push('r'); },                // 3686
                                   destroyed: function () { buf.push('d'); }},              // 3687
                                  function () { return 'x'; });                             // 3688
    });                                                                                     // 3689
  };                                                                                        // 3690
                                                                                            // 3691
  var R = ReactiveVar("foo");                                                               // 3692
                                                                                            // 3693
  var div = OnscreenDiv(Meteor.render(function () {                                         // 3694
    return ublm() + ublm() + ublm() + R.get();                                              // 3695
  }));                                                                                      // 3696
  Deps.flush();                                                                             // 3697
  test.equal(bufstr(), 'cccrrr');                                                           // 3698
  R.set('bar');                                                                             // 3699
  Deps.flush();                                                                             // 3700
  test.equal(bufstr(), 'cccdddrrr');                                                        // 3701
                                                                                            // 3702
  div.kill();                                                                               // 3703
  Deps.flush();                                                                             // 3704
  test.equal(bufstr(), 'ddd');                                                              // 3705
                                                                                            // 3706
});                                                                                         // 3707
                                                                                            // 3708
Tinytest.add("spark - list update", function (test) {                                       // 3709
  var R = ReactiveVar('foo');                                                               // 3710
                                                                                            // 3711
  var lst = [];                                                                             // 3712
  lst.callbacks = [];                                                                       // 3713
  lst.observeChanges = function(callbacks) {                                                // 3714
    lst.callbacks.push(callbacks);                                                          // 3715
    _.each(lst, function(x) {                                                               // 3716
      callbacks.addedBefore(x._id, x, null);                                                // 3717
    });                                                                                     // 3718
    return {                                                                                // 3719
      stop: function() {                                                                    // 3720
        lst.callbacks = _.without(lst.callbacks, callbacks);                                // 3721
      }                                                                                     // 3722
    };                                                                                      // 3723
  };                                                                                        // 3724
  lst.another = function () {                                                               // 3725
    var i = lst.length;                                                                     // 3726
    lst.push({_id:'item'+i});                                                               // 3727
    _.each(lst.callbacks, function (callbacks) {                                            // 3728
      callbacks.addedBefore(lst[i]._id, lst[i], null);                                      // 3729
    });                                                                                     // 3730
  };                                                                                        // 3731
  var div = OnscreenDiv(Meteor.render(function() {                                          // 3732
    return R.get() + Spark.list(lst, function () {                                          // 3733
      return '<hr>';                                                                        // 3734
    });                                                                                     // 3735
  }));                                                                                      // 3736
                                                                                            // 3737
  lst.another();                                                                            // 3738
  Deps.flush();                                                                             // 3739
  test.equal(div.html(), "foo<hr>");                                                        // 3740
                                                                                            // 3741
  lst.another();                                                                            // 3742
  R.set('bar');                                                                             // 3743
  Deps.flush();                                                                             // 3744
  test.equal(div.html(), "bar<hr><hr>");                                                    // 3745
                                                                                            // 3746
  R.set('baz');                                                                             // 3747
  lst.another();                                                                            // 3748
  Deps.flush();                                                                             // 3749
  test.equal(div.html(), "baz<hr><hr><hr>");                                                // 3750
                                                                                            // 3751
  div.kill();                                                                               // 3752
  Deps.flush();                                                                             // 3753
});                                                                                         // 3754
                                                                                            // 3755
Tinytest.add("spark - callback context", function (test) {                                  // 3756
  // Test that context in template callbacks is null.                                       // 3757
                                                                                            // 3758
  var cxs = [];                                                                             // 3759
  var buf = [];                                                                             // 3760
                                                                                            // 3761
  var R = ReactiveVar("foo");                                                               // 3762
  var getCx = function () { return Deps.currentComputation; };                              // 3763
  var callbackFunc = function (ltr) {                                                       // 3764
    return function () {                                                                    // 3765
      buf.push(ltr);                                                                        // 3766
      cxs.push(getCx());                                                                    // 3767
    };                                                                                      // 3768
  };                                                                                        // 3769
  var div = OnscreenDiv(Meteor.render(function () {                                         // 3770
    var cx = getCx();                                                                       // 3771
    test.isTrue(cx); // sanity check for getCx                                              // 3772
    var makeLandmark = function () {                                                        // 3773
      return Spark.createLandmark({created: callbackFunc('c'),                              // 3774
                                   rendered: callbackFunc('r'),                             // 3775
                                   destroyed: callbackFunc('d')},                           // 3776
                                  function () {                                             // 3777
                                    return '<span>'+R.get()+'</span>';                      // 3778
                                  });                                                       // 3779
    };                                                                                      // 3780
    if (R.get() === 'foo')                                                                  // 3781
      var unused = makeLandmark(); // will cause created/destroyed                          // 3782
    var html = Spark.labelBranch("foo", makeLandmark);                                      // 3783
    test.isTrue(getCx() === cx); // test that context was restored                          // 3784
    return html;                                                                            // 3785
  }));                                                                                      // 3786
  Deps.flush();                                                                             // 3787
  R.set('bar');                                                                             // 3788
  Deps.flush();                                                                             // 3789
  div.kill();                                                                               // 3790
  Deps.flush();                                                                             // 3791
                                                                                            // 3792
  test.equal(buf.join(''), 'ccdrrd');                                                       // 3793
  test.equal(cxs.length, 6);                                                                // 3794
  test.isFalse(cxs[0]);                                                                     // 3795
  test.isFalse(cxs[1]);                                                                     // 3796
  test.isFalse(cxs[2]);                                                                     // 3797
  test.isFalse(cxs[3]);                                                                     // 3798
  test.isFalse(cxs[4]);                                                                     // 3799
  test.isFalse(cxs[5]);                                                                     // 3800
                                                                                            // 3801
});                                                                                         // 3802
                                                                                            // 3803
Tinytest.add("spark - legacy preserve names", function (test) {                             // 3804
  var R = ReactiveVar("foo");                                                               // 3805
  var R2 = ReactiveVar("apple");                                                            // 3806
                                                                                            // 3807
  var div = OnscreenDiv(renderWithPreservation(function () {                                // 3808
    R.get(); // create dependency                                                           // 3809
    return ('<div id="aaa"><div><input name="field"></div></div>' +                         // 3810
            '<div id="bbb"><div><input name="field"></div></div>' +                         // 3811
            '<div id="ccc"><div>' + Spark.isolate(function () {                             // 3812
              R2.get();                                                                     // 3813
              return '<input name="field">'; }) + '</div></div>' +                          // 3814
            '<input type="text">');                                                         // 3815
  }));                                                                                      // 3816
                                                                                            // 3817
                                                                                            // 3818
  var inputs1 = nodesToArray(div.node().getElementsByTagName('input'));                     // 3819
  R.set('bar');                                                                             // 3820
  Deps.flush();                                                                             // 3821
  var inputs2 = nodesToArray(div.node().getElementsByTagName('input'));                     // 3822
  test.isTrue(inputs1[0] === inputs2[0]);                                                   // 3823
  test.isTrue(inputs1[1] === inputs2[1]);                                                   // 3824
  test.isTrue(inputs1[2] === inputs2[2]);                                                   // 3825
  test.isTrue(inputs1[3] !== inputs2[3]);                                                   // 3826
                                                                                            // 3827
  R2.set('banana');                                                                         // 3828
  Deps.flush();                                                                             // 3829
  var inputs3 = nodesToArray(div.node().getElementsByTagName('input'));                     // 3830
  test.isTrue(inputs1[2] === inputs3[2]);                                                   // 3831
                                                                                            // 3832
  div.kill();                                                                               // 3833
  Deps.flush();                                                                             // 3834
});                                                                                         // 3835
                                                                                            // 3836
Tinytest.add("spark - update defunct range", function (test) {                              // 3837
  // Test that Spark doesn't freak out if it tries to update                                // 3838
  // a LiveRange on nodes that have been taken out of the document.                         // 3839
  //                                                                                        // 3840
  // See https://github.com/meteor/meteor/issues/392.                                       // 3841
                                                                                            // 3842
  var R = ReactiveVar("foo");                                                               // 3843
                                                                                            // 3844
  var div = OnscreenDiv(Spark.render(function () {                                          // 3845
    return "<p>" + Spark.isolate(function() {                                               // 3846
      return R.get();                                                                       // 3847
    }) + "</p>";                                                                            // 3848
  }));                                                                                      // 3849
                                                                                            // 3850
  test.equal(div.html(), "<p>foo</p>");                                                     // 3851
  R.set("bar");                                                                             // 3852
  Deps.flush();                                                                             // 3853
  test.equal(R.numListeners(), 1);                                                          // 3854
  test.equal(div.html(), "<p>bar</p>");                                                     // 3855
  test.equal(div.node().firstChild.nodeName, "P");                                          // 3856
  div.node().firstChild.innerHTML = '';                                                     // 3857
  R.set("baz");                                                                             // 3858
  Deps.flush(); // should throw no errors                                                   // 3859
  // will be 1 if our isolate func was run.                                                 // 3860
  test.equal(R.numListeners(), 0);                                                          // 3861
                                                                                            // 3862
  /////                                                                                     // 3863
                                                                                            // 3864
  R = ReactiveVar("foo");                                                                   // 3865
                                                                                            // 3866
  div = OnscreenDiv(Spark.render(function () {                                              // 3867
    return "<p>" + Spark.setDataContext(                                                    // 3868
      {},                                                                                   // 3869
      "<span>" + Spark.isolate(function() {                                                 // 3870
        return R.get();                                                                     // 3871
      }) + "</span>") + "</p>";                                                             // 3872
  }));                                                                                      // 3873
                                                                                            // 3874
  test.equal(div.html(), "<p><span>foo</span></p>");                                        // 3875
  R.set("bar");                                                                             // 3876
  Deps.flush();                                                                             // 3877
  test.equal(R.numListeners(), 1);                                                          // 3878
  test.equal(div.html(), "<p><span>bar</span></p>");                                        // 3879
  test.equal(div.node().firstChild.nodeName, "P");                                          // 3880
  div.node().firstChild.innerHTML = '';                                                     // 3881
  R.set("baz");                                                                             // 3882
  Deps.flush(); // should throw no errors                                                   // 3883
  // will be 1 if our isolate func was run.                                                 // 3884
  test.equal(R.numListeners(), 0);                                                          // 3885
                                                                                            // 3886
});                                                                                         // 3887
                                                                                            // 3888
//////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

//////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                          //
// packages/spark/patch_tests.js                                                            //
//                                                                                          //
//////////////////////////////////////////////////////////////////////////////////////////////
                                                                                            //
Tinytest.add("spark - patch - basic", function(test) {                                      // 1
                                                                                            // 2
  var Patcher = SparkTest.Patcher;                                                          // 3
                                                                                            // 4
  var div = function(html) {                                                                // 5
    var n = document.createElement("DIV");                                                  // 6
    n.innerHTML = html;                                                                     // 7
    return n;                                                                               // 8
  };                                                                                        // 9
  var tag = function(node, tagName, which) {                                                // 10
    return node.getElementsByTagName(tagName)[which || 0];                                  // 11
  };                                                                                        // 12
  var assert_html = function(actual, expected) {                                            // 13
    actual = (typeof actual === "string" ? actual : actual.innerHTML);                      // 14
    expected = (typeof expected === "string" ? expected : expected.innerHTML);              // 15
    test.equal(actual.toLowerCase(), expected.toLowerCase());                               // 16
  };                                                                                        // 17
                                                                                            // 18
  var x,y,p,ret;                                                                            // 19
                                                                                            // 20
  x = div("<b><i>foo</i><u>bar</u></b>");                                                   // 21
  y = div("<b><u>qux</u><s>baz</s></b>");                                                   // 22
  p = new Patcher(x, y);                                                                    // 23
  ret = p.match(tag(x, 'u'), tag(y, 'u'));                                                  // 24
  test.isTrue(ret);                                                                         // 25
  assert_html(x, "<b><u>bar</u></b>");                                                      // 26
  ret = p.finish();                                                                         // 27
  test.isTrue(ret);                                                                         // 28
  assert_html(x, "<b><u>bar</u><s>baz</s></b>");                                            // 29
                                                                                            // 30
  x = div("<b><i>foo</i><u>bar</u></b>");                                                   // 31
  y = div("<b><u>qux</u><s>baz</s></b>");                                                   // 32
  p = new Patcher(x, y);                                                                    // 33
  ret = p.finish();                                                                         // 34
  test.isTrue(ret);                                                                         // 35
  assert_html(x, "<b><u>qux</u><s>baz</s></b>");                                            // 36
                                                                                            // 37
  x = div("<b><i><u>foo</u></i></b><b><i><u><s>bar</s></u></i></b>");                       // 38
  y = div(                                                                                  // 39
    "1<b>2<i>3<u>foo</u>4</i>5</b>6<b>7<i>8<u>9<s>bar</s>10</u>11</i>12</b>13");            // 40
  p = new Patcher(x, y);                                                                    // 41
  ret = p.match(tag(x, 'u'), tag(y, 'u'));                                                  // 42
  test.isTrue(ret);                                                                         // 43
  assert_html(x, "1<b>2<i>3<u>foo</u></i></b><b><i><u><s>bar</s></u></i></b>");             // 44
  ret = p.match(tag(x, 's'), tag(y, 's'));                                                  // 45
  test.isTrue(ret);                                                                         // 46
  assert_html(                                                                              // 47
    x,                                                                                      // 48
    "1<b>2<i>3<u>foo</u>4</i>5</b>6<b>7<i>8<u>9<s>bar</s></u></i></b>");                    // 49
  ret = p.finish();                                                                         // 50
  test.isTrue(ret);                                                                         // 51
  assert_html(                                                                              // 52
    x,                                                                                      // 53
    "1<b>2<i>3<u>foo</u>4</i>5</b>6<b>7<i>8<u>9<s>bar</s>10</u>11</i>12</b>13");            // 54
                                                                                            // 55
  // mismatched parents, detection and recovery                                             // 56
                                                                                            // 57
  x = div("<b><i>foo</i><u>bar</u></b>");                                                   // 58
  y = div("<b><i>foo</i></b><b><u>bar</u></b>");                                            // 59
  p = new Patcher(x,y);                                                                     // 60
  ret = p.match(tag(x, 'i'), tag(y, 'i'));                                                  // 61
  test.isTrue(ret);                                                                         // 62
  assert_html(x, "<b><i>foo</i><u>bar</u></b>");                                            // 63
  ret = p.match(tag(x, 'u'), tag(y, 'u'));                                                  // 64
  test.isFalse(ret);                                                                        // 65
  assert_html(x, "<b><i>foo</i><u>bar</u></b>");                                            // 66
  ret = p.finish();                                                                         // 67
  test.isTrue(ret);                                                                         // 68
  assert_html(x,"<b><i>foo</i></b><b><u>bar</u></b>");                                      // 69
                                                                                            // 70
  x = div("<b><i>foo</i></b><b><u>bar</u></b>");                                            // 71
  y = div("<b><i>foo</i><u>bar</u></b>");                                                   // 72
  p = new Patcher(x,y);                                                                     // 73
  ret = p.match(tag(x, 'i'), tag(y, 'i'));                                                  // 74
  test.isTrue(ret);                                                                         // 75
  assert_html(x, "<b><i>foo</i></b><b><u>bar</u></b>");                                     // 76
  ret = p.match(tag(x, 'u'), tag(y, 'u'));                                                  // 77
  test.isFalse(ret);                                                                        // 78
  assert_html(x, "<b><i>foo</i><u>bar</u></b><b><u>bar</u></b>");                           // 79
  ret = p.finish();                                                                         // 80
  test.isTrue(ret);                                                                         // 81
  assert_html(x, "<b><i>foo</i><u>bar</u></b>");                                            // 82
                                                                                            // 83
  // mismatched tag name, detection and recovery                                            // 84
  x = div("<b><i>foo</i><u>bar</u></b>");                                                   // 85
  y = div("<i><u>bar</u><s>baz</s></i>");                                                   // 86
  p = new Patcher(x, y);                                                                    // 87
  ret = p.match(tag(x, 'u'), tag(y, 'u'));                                                  // 88
  test.isFalse(ret);                                                                        // 89
  ret = p.finish();                                                                         // 90
  test.isTrue(ret);                                                                         // 91
  assert_html(x, "<i><u>bar</u><s>baz</s></i>");                                            // 92
                                                                                            // 93
  var t = "_foo";                                                                           // 94
  var liverange = function(start, end, inner) {                                             // 95
    return new LiveRange(t, start, end, inner);                                             // 96
  };                                                                                        // 97
                                                                                            // 98
  var rangeTest = function(extras) {                                                        // 99
    var aaa = extras[0], zzz = extras[1];                                                   // 100
    x = div(aaa+"<b><i>foo</i><u>bar</u></b>"+zzz);                                         // 101
    y = div("<b><u>bar</u><s>baz</s></b>");                                                 // 102
    var rng = liverange(tag(y, 'u'));                                                       // 103
    var tgt = liverange(tag(x, 'b'));                                                       // 104
    p = new Patcher(tgt.containerNode(), y,                                                 // 105
                    tgt.firstNode().previousSibling,                                        // 106
                    tgt.lastNode().nextSibling);                                            // 107
    var copyCallback = function(tgt, src) {                                                 // 108
      LiveRange.transplantTag(t, tgt, src);                                                 // 109
    };                                                                                      // 110
    ret = p.match(tag(x, 'u'), tag(y, 'u'), copyCallback);                                  // 111
    test.isTrue(ret);                                                                       // 112
    assert_html(x, aaa+"<b><u>bar</u></b>"+zzz);                                            // 113
    ret = p.finish();                                                                       // 114
    test.isTrue(ret);                                                                       // 115
    assert_html(x, aaa+"<b><u>bar</u><s>baz</s></b>"+zzz);                                  // 116
    test.equal(rng.firstNode(), tag(x, 'u'));                                               // 117
  };                                                                                        // 118
                                                                                            // 119
  _.each([["aaa","zzz"], ["",""], ["aaa",""], ["","zzz"]], rangeTest);                      // 120
});                                                                                         // 121
                                                                                            // 122
Tinytest.add("spark - patch - copyAttributes", function(test) {                             // 123
                                                                                            // 124
  var attrTester = function(tagName, initial) {                                             // 125
    var node;                                                                               // 126
    var allAttrNames = {};                                                                  // 127
    var lastAttrs;                                                                          // 128
    var self = {                                                                            // 129
      copy: function(kv) {                                                                  // 130
        var buf = [];                                                                       // 131
        buf.push('<', tagName);                                                             // 132
        _.each(kv, function(v,k) {                                                          // 133
          allAttrNames[k] = true;                                                           // 134
          buf.push(' ', k);                                                                 // 135
          if (v !== 'NO_VALUE')                                                             // 136
            buf.push('="', v, '"');                                                         // 137
        });                                                                                 // 138
        buf.push('></', tagName, '>');                                                      // 139
        var nodeHtml = buf.join('');                                                        // 140
        var frag = DomUtils.htmlToFragment(nodeHtml);                                       // 141
        var n = frag.firstChild;                                                            // 142
        n._sparkOriginalRenderedChecked = [n.checked];                                      // 143
        if (! node) {                                                                       // 144
          node = n;                                                                         // 145
        } else {                                                                            // 146
          SparkTest.Patcher._copyAttributes(node, n);                                       // 147
        }                                                                                   // 148
        lastAttrs = {};                                                                     // 149
        _.each(allAttrNames, function(v,k) {                                                // 150
          lastAttrs[k] = false;                                                             // 151
        });                                                                                 // 152
        _.each(kv, function(v,k) {                                                          // 153
          if (k === "style") {                                                              // 154
            lastAttrs[k] = n.style.cssText;                                                 // 155
          } else {                                                                          // 156
            lastAttrs[k] = String(v);                                                       // 157
          }                                                                                 // 158
        });                                                                                 // 159
        return self;                                                                        // 160
      },                                                                                    // 161
      check: function() {                                                                   // 162
        _.each(lastAttrs, function(v,k) {                                                   // 163
          var actualAttr;                                                                   // 164
          var expectedAttr = v || "";                                                       // 165
          if (k === "style") {                                                              // 166
            actualAttr = node.style.cssText;                                                // 167
          } else if (k === "class") {                                                       // 168
            actualAttr = node.className;                                                    // 169
          } else if (k === "checked") {                                                     // 170
            actualAttr = String(node.getAttribute(k) || "");                                // 171
            if (expectedAttr === "NO_VALUE")                                                // 172
              expectedAttr = "checked";                                                     // 173
            if (actualAttr === "true")                                                      // 174
              actualAttr = "checked"; // save IE's butt                                     // 175
          } else {                                                                          // 176
            actualAttr = String(node.getAttribute(k) || "");                                // 177
          }                                                                                 // 178
          test.equal(actualAttr, expectedAttr, k);                                          // 179
        });                                                                                 // 180
      },                                                                                    // 181
      node: function() { return node; }                                                     // 182
    };                                                                                      // 183
    if (initial)                                                                            // 184
      self.copy(initial);                                                                   // 185
    return self;                                                                            // 186
  };                                                                                        // 187
                                                                                            // 188
  var a = attrTester('div',                                                                 // 189
                     {id:'foo', 'class':'bar',                                              // 190
                      style:'border:1px solid blue;', name:'baz'});                         // 191
  a.check();                                                                                // 192
  test.equal(a.node().style.borderLeftColor, "blue");                                       // 193
                                                                                            // 194
  a.copy({id: "foo", style:'border:1px solid red'});                                        // 195
  a.check();                                                                                // 196
  test.equal(a.node().style.borderLeftColor, "red");                                        // 197
                                                                                            // 198
  a.copy({id: "foo", 'class':'ha'});                                                        // 199
  a.check();                                                                                // 200
  test.equal(a.node().style.borderColor, "");                                               // 201
  test.equal(a.node().className, "ha");                                                     // 202
                                                                                            // 203
  var obj = {};                                                                             // 204
  a.node().nifty = obj;                                                                     // 205
  a.copy({id: "foo", 'class':'ha hee'});                                                    // 206
  a.check();                                                                                // 207
  test.equal(a.node().nifty, obj, 'nifty'); // test object property preservation            // 208
                                                                                            // 209
                                                                                            // 210
  var c = attrTester('input', {type:'checkbox', name:'foo', checked:'checked'});            // 211
  c.check();                                                                                // 212
  test.equal(c.node().checked, true);                                                       // 213
  c.copy({type:'checkbox', name:'foo'});                                                    // 214
  c.check();                                                                                // 215
  test.equal(c.node().checked, false);                                                      // 216
  c.copy({type:'checkbox', name:'foo', checked:'checked'});                                 // 217
  c.check();                                                                                // 218
  test.equal(c.node().checked, true);                                                       // 219
  c.copy({type:'checkbox', name:'foo'});                                                    // 220
  c.check();                                                                                // 221
  test.equal(c.node().checked, false);                                                      // 222
                                                                                            // 223
  var d = attrTester('input', {type:'checkbox', name:'foo'});                               // 224
  test.equal(c.node().checked, false);                                                      // 225
  c.copy({type:'checkbox', name:'foo', checked:'checked'});                                 // 226
  c.check();                                                                                // 227
  test.equal(c.node().checked, true);                                                       // 228
  c.copy({type:'checkbox', name:'foo'});                                                    // 229
  c.check();                                                                                // 230
  test.equal(c.node().checked, false);                                                      // 231
  c.copy({type:'checkbox', name:'foo', checked:'checked'});                                 // 232
  c.check();                                                                                // 233
  test.equal(c.node().checked, true);                                                       // 234
  c.copy({type:'checkbox', name:'foo'});                                                    // 235
  c.check();                                                                                // 236
  test.equal(c.node().checked, false);                                                      // 237
  c.copy({type:'checkbox', name:'foo', checked:'NO_VALUE'});                                // 238
  c.check();                                                                                // 239
  test.equal(c.node().checked, true);                                                       // 240
                                                                                            // 241
  c.copy({type:'checkbox', name:'bar'});                                                    // 242
  test.expect_fail(); // changing "name" on a form control won't take in IE                 // 243
  test.equal(c.node().getAttribute("name"), 'bar');                                         // 244
                                                                                            // 245
  c.copy({type:'radio', name:'foo'});                                                       // 246
  test.expect_fail(); // changing "type" on a form control won't take in IE                 // 247
  test.equal(c.node().getAttribute("type"), 'radio');                                       // 248
                                                                                            // 249
                                                                                            // 250
});                                                                                         // 251
                                                                                            // 252
//////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);
