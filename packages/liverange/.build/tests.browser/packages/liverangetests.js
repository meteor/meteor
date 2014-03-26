(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/liverange/liverange_test_helpers.js                                                                        //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
// checks that ranges balance and that node and index pointers are                                                     // 1
// correct. if both of these things are true, then everything                                                          // 2
// contained by 'range' must be a valid subtree. (assuming that                                                        // 3
// visit() is actually working.)                                                                                       // 4
check_liverange_integrity = function (range) {                                                                         // 5
  var stack = [];                                                                                                      // 6
                                                                                                                       // 7
  var check_node = function (node) {                                                                                   // 8
    var data = node[range.tag] || [[], []];                                                                            // 9
    for (var i = 0; i < data[0].length; i++) {                                                                         // 10
      if (data[0][i]._start !== node)                                                                                  // 11
        throw new Error("integrity check failed - incorrect _start");                                                  // 12
      if (data[0][i]._startIndex !== i)                                                                                // 13
        throw new Error("integrity check failed - incorrect _startIndex");                                             // 14
    }                                                                                                                  // 15
    for (var i = 0; i < data[1].length; i++) {                                                                         // 16
      if (data[1][i]._end !== node)                                                                                    // 17
        throw new Error("integrity check failed - incorrect _end");                                                    // 18
      if (data[1][i]._endIndex !== i)                                                                                  // 19
        throw new Error("integrity check failed - incorrect _endIndex");                                               // 20
    }                                                                                                                  // 21
  };                                                                                                                   // 22
                                                                                                                       // 23
  range.visit(function (isStart, range) {                                                                              // 24
    if (isStart)                                                                                                       // 25
      stack.push(range);                                                                                               // 26
    else                                                                                                               // 27
      if (range !== stack.pop())                                                                                       // 28
        throw new Error("integrity check failed - unbalanced range");                                                  // 29
  }, function (isStart, node) {                                                                                        // 30
    if (isStart) {                                                                                                     // 31
      check_node(node);                                                                                                // 32
      stack.push(node);                                                                                                // 33
    }                                                                                                                  // 34
    else                                                                                                               // 35
      if (node !== stack.pop())                                                                                        // 36
        throw new Error("integrity check failed - unbalanced node");                                                   // 37
  });                                                                                                                  // 38
                                                                                                                       // 39
  if (stack.length)                                                                                                    // 40
    throw new Error("integrity check failed - missing close tags");                                                    // 41
};                                                                                                                     // 42
                                                                                                                       // 43
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/liverange/liverange_tests.js                                                                               //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
/******************************************************************************/                                       // 1
                                                                                                                       // 2
var create = function (id, start, end, inner, tag) {                                                                   // 3
  var ret = new LiveRange(tag || 'a', start, end, inner);                                                              // 4
  ret.id = id;                                                                                                         // 5
  return ret;                                                                                                          // 6
};                                                                                                                     // 7
                                                                                                                       // 8
var frag = function (html) {                                                                                           // 9
  var ret = document.createDocumentFragment();                                                                         // 10
  var q = $(html);                                                                                                     // 11
  for (var i = 0; i < q.length; i++)                                                                                   // 12
    ret.appendChild(q[i]);                                                                                             // 13
  return ret;                                                                                                          // 14
};                                                                                                                     // 15
                                                                                                                       // 16
// takes ranges or fragments. tag is used only for fragments.                                                          // 17
var dump = function (what, tag) {                                                                                      // 18
  var ret = "";                                                                                                        // 19
                                                                                                                       // 20
  var emit = function (isStart, obj) {                                                                                 // 21
    ret += (isStart ? "<": "</") + obj.id + ">";                                                                       // 22
  };                                                                                                                   // 23
                                                                                                                       // 24
  if (typeof what === 'object' && what.nodeType === 11 /* DocumentFragment */) {                                       // 25
    if (what.firstChild) {                                                                                             // 26
      var range = new LiveRange(tag || 'a', what);                                                                     // 27
      range.visit(emit, emit);                                                                                         // 28
      range.destroy();                                                                                                 // 29
    }                                                                                                                  // 30
  } else {                                                                                                             // 31
    emit(true, what);                                                                                                  // 32
    what.visit(emit, emit);                                                                                            // 33
    emit(false, what);                                                                                                 // 34
  }                                                                                                                    // 35
                                                                                                                       // 36
  return ret;                                                                                                          // 37
};                                                                                                                     // 38
                                                                                                                       // 39
// actual can be a range or a fragment                                                                                 // 40
var assert_dump = function (test, expected, actual, tag) {                                                             // 41
  test.equal(dump(actual), expected, "Tree doesn't match");                                                            // 42
  if (actual instanceof LiveRange)                                                                                     // 43
    check_liverange_integrity(actual);                                                                                 // 44
  else {                                                                                                               // 45
    if (actual.firstChild) {                                                                                           // 46
      var range = new LiveRange(tag || 'a', actual);                                                                   // 47
      check_liverange_integrity(range);                                                                                // 48
      range.destroy();                                                                                                 // 49
    }                                                                                                                  // 50
  }                                                                                                                    // 51
};                                                                                                                     // 52
                                                                                                                       // 53
var contained_ranges = function (range) {                                                                              // 54
  var result = {range: range, children: []};                                                                           // 55
  var stack = [result];                                                                                                // 56
                                                                                                                       // 57
  range.visit(function (isStart, range) {                                                                              // 58
    if (isStart) {                                                                                                     // 59
      var record = {range: range, children: []};                                                                       // 60
      stack[stack.length - 1].children.push(record);                                                                   // 61
      stack.push(record);                                                                                              // 62
    } else                                                                                                             // 63
      if (stack.pop().range !== range)                                                                                 // 64
        throw new Error("Overlapping ranges detected");                                                                // 65
  });                                                                                                                  // 66
                                                                                                                       // 67
  return result;                                                                                                       // 68
};                                                                                                                     // 69
                                                                                                                       // 70
var assert_contained = function (r, expected) {                                                                        // 71
  // one day, fold in the above function (use visit() directly)                                                        // 72
  var actual = contained_ranges(r);                                                                                    // 73
                                                                                                                       // 74
  var traverse = function (exp, act) {                                                                                 // 75
    if (exp.range !== act.range)                                                                                       // 76
      throw new Error("contained(): range doesn't match");                                                             // 77
    if (exp.children.length !== act.children.length)                                                                   // 78
      throw new Error("contained(): different tree shape");                                                            // 79
    for (var i = 0; i < exp.children.length; i++)                                                                      // 80
      traverse(exp.children[i], act.children[i]);                                                                      // 81
  };                                                                                                                   // 82
                                                                                                                       // 83
  traverse(expected, actual);                                                                                          // 84
};                                                                                                                     // 85
                                                                                                                       // 86
/******************************************************************************/                                       // 87
                                                                                                                       // 88
Tinytest.add("liverange - single node", function (test) {                                                              // 89
  var f = frag("<div id=1></div>");                                                                                    // 90
  var r_a = create("a", f);                                                                                            // 91
  test.instanceOf(r_a, LiveRange);                                                                                     // 92
  assert_dump(test, "<a><1></1></a>", r_a);                                                                            // 93
  assert_dump(test, "<a><1></1></a>", f);                                                                              // 94
  assert_contained(r_a, {range: r_a, children: []});                                                                   // 95
                                                                                                                       // 96
  var r_b = create("b", f);                                                                                            // 97
  assert_dump(test, "<a><1></1></a>", r_a);                                                                            // 98
  assert_dump(test, "<b><a><1></1></a></b>", r_b);                                                                     // 99
  assert_dump(test, "<b><a><1></1></a></b>", f);                                                                       // 100
  assert_contained(r_a, {range: r_a, children: []});                                                                   // 101
  assert_contained(r_b, {range: r_b, children: [{range: r_a, children: []}]});                                         // 102
  test.equal(r_a.firstNode(), f.firstChild);                                                                           // 103
  test.equal(r_a.lastNode(), f.lastChild);                                                                             // 104
  test.equal(r_b.firstNode(), f.firstChild);                                                                           // 105
  test.equal(r_b.lastNode(), f.lastChild);                                                                             // 106
                                                                                                                       // 107
  var ret1 = r_a.replaceContents(frag("<div id=2></div>"), true);                                                      // 108
  test.equal(ret1.nodeType, 11 /* DocumentFragment */);                                                                // 109
  assert_dump(test, "<1></1>", ret1);                                                                                  // 110
  assert_dump(test, "<a><2></2></a>", r_a);                                                                            // 111
  assert_dump(test, "<b><a><2></2></a></b>", r_b);                                                                     // 112
  assert_dump(test, "<b><a><2></2></a></b>", f);                                                                       // 113
                                                                                                                       // 114
  var ret2 = r_b.replaceContents(frag("<div id=3></div>"), true);                                                      // 115
  assert_dump(test, "<a><2></2></a>", ret2);                                                                           // 116
  assert_dump(test, "<a><2></2></a>", r_a);                                                                            // 117
  assert_dump(test, "<b><3></3></b>", r_b);                                                                            // 118
  assert_dump(test, "<b><3></3></b>", f);                                                                              // 119
                                                                                                                       // 120
  r_a.destroy();                                                                                                       // 121
  assert_dump(test, "<2></2>", ret2);                                                                                  // 122
                                                                                                                       // 123
  var r_c = create("c", f);                                                                                            // 124
  var r_d = create("d", f);                                                                                            // 125
  var r_e = create("e", f);                                                                                            // 126
  assert_dump(test, "<c><b><3></3></b></c>", r_c);                                                                     // 127
  assert_dump(test, "<d><c><b><3></3></b></c></d>", r_d);                                                              // 128
  assert_dump(test, "<e><d><c><b><3></3></b></c></d></e>", r_e);                                                       // 129
  assert_dump(test, "<1></1>", ret1);                                                                                  // 130
  assert_dump(test, "<b><3></3></b>", r_b);                                                                            // 131
                                                                                                                       // 132
  r_d.destroy();                                                                                                       // 133
  assert_dump(test, "<b><3></3></b>", r_b);                                                                            // 134
  assert_dump(test, "<c><b><3></3></b></c>", r_c);                                                                     // 135
  assert_dump(test, "<e><c><b><3></3></b></c></e>", r_e);                                                              // 136
  assert_dump(test, "<1></1>", ret1);                                                                                  // 137
                                                                                                                       // 138
  assert_contained(r_e,                                                                                                // 139
                   {range: r_e,                                                                                        // 140
                    children: [{range: r_c,                                                                            // 141
                                children: [{range: r_b, children: []}]}]});                                            // 142
                                                                                                                       // 143
  test.equal(r_b.firstNode(), f.firstChild);                                                                           // 144
  test.equal(r_b.lastNode(), f.lastChild);                                                                             // 145
  test.equal(r_c.firstNode(), f.firstChild);                                                                           // 146
  test.equal(r_c.lastNode(), f.lastChild);                                                                             // 147
  test.equal(r_e.firstNode(), f.firstChild);                                                                           // 148
  test.equal(r_e.lastNode(), f.lastChild);                                                                             // 149
                                                                                                                       // 150
  r_b.destroy();                                                                                                       // 151
  assert_dump(test, "<c><3></3></c>", r_c);                                                                            // 152
  assert_dump(test, "<e><c><3></3></c></e>", r_e);                                                                     // 153
                                                                                                                       // 154
  r_e.destroy();                                                                                                       // 155
  assert_dump(test, "<c><3></3></c>", r_c);                                                                            // 156
                                                                                                                       // 157
});                                                                                                                    // 158
                                                                                                                       // 159
Tinytest.add("liverange - empty replace", function (test) {                                                            // 160
  var f,r;                                                                                                             // 161
                                                                                                                       // 162
  f = frag("<div id=1></div>");                                                                                        // 163
  r = create("z", f);                                                                                                  // 164
  test.throws(function() {                                                                                             // 165
    r.replaceContents(frag(""));                                                                                       // 166
  });                                                                                                                  // 167
                                                                                                                       // 168
  f = frag("<div id=1></div><div id=2></div><div id=3></div>");                                                        // 169
  r = create("z", f.childNodes[1]);                                                                                    // 170
  assert_dump(test, "<1></1><z><2></2></z><3></3>", f);                                                                // 171
  test.throws(function() {                                                                                             // 172
    r.replaceContents(frag(""));                                                                                       // 173
  });                                                                                                                  // 174
});                                                                                                                    // 175
                                                                                                                       // 176
Tinytest.add("liverange - multiple nodes", function (test) {                                                           // 177
  var f = frag("<div id=1></div><div id=2></div><div id=3></div><div id=4></div><div id=5></div>");                    // 178
  assert_dump(test, "<1></1><2></2><3></3><4></4><5></5>", f);                                                         // 179
                                                                                                                       // 180
  var r_a = create("a", f.childNodes[2], f.childNodes[3]);                                                             // 181
  assert_dump(test, "<1></1><2></2><a><3></3><4></4></a><5></5>", f);                                                  // 182
  assert_dump(test, "<a><3></3><4></4></a>", r_a);                                                                     // 183
                                                                                                                       // 184
  var r_b = create("b", f.childNodes[3], f.childNodes[3]);                                                             // 185
  assert_dump(test, "<1></1><2></2><a><3></3><b><4></4></b></a><5></5>", f);                                           // 186
  assert_dump(test, "<a><3></3><b><4></4></b></a>", r_a);                                                              // 187
  assert_dump(test, "<b><4></4></b>", r_b);                                                                            // 188
                                                                                                                       // 189
  var r_c = create("c", f.childNodes[2], f.childNodes[3]);                                                             // 190
  assert_dump(test, "<1></1><2></2><c><a><3></3><b><4></4></b></a></c><5></5>", f);                                    // 191
  assert_dump(test, "<a><3></3><b><4></4></b></a>", r_a);                                                              // 192
  assert_dump(test, "<b><4></4></b>", r_b);                                                                            // 193
  assert_dump(test, "<c><a><3></3><b><4></4></b></a></c>", r_c);                                                       // 194
                                                                                                                       // 195
  var r_d = create("d", f.childNodes[3], f.childNodes[3]);                                                             // 196
  assert_dump(test, "<1></1><2></2><c><a><3></3><d><b><4></4></b></d></a></c><5></5>", f);                             // 197
  assert_dump(test, "<a><3></3><d><b><4></4></b></d></a>", r_a);                                                       // 198
  assert_dump(test, "<b><4></4></b>", r_b);                                                                            // 199
  assert_dump(test, "<c><a><3></3><d><b><4></4></b></d></a></c>", r_c);                                                // 200
  assert_dump(test, "<d><b><4></4></b></d>", r_d);                                                                     // 201
                                                                                                                       // 202
  var r_e = create("e", f.childNodes[2], f.childNodes[2]);                                                             // 203
  assert_dump(test, "<1></1><2></2><c><a><e><3></3></e><d><b><4></4></b></d></a></c><5></5>", f);                      // 204
  assert_dump(test, "<a><e><3></3></e><d><b><4></4></b></d></a>", r_a);                                                // 205
  assert_dump(test, "<b><4></4></b>", r_b);                                                                            // 206
  assert_dump(test, "<c><a><e><3></3></e><d><b><4></4></b></d></a></c>", r_c);                                         // 207
  assert_dump(test, "<d><b><4></4></b></d>", r_d);                                                                     // 208
  assert_dump(test, "<e><3></3></e>", r_e);                                                                            // 209
                                                                                                                       // 210
  var r_f = create("f", f.childNodes[2], f.childNodes[3]);                                                             // 211
  assert_dump(test, "<1></1><2></2><f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f><5></5>", f);               // 212
  assert_dump(test, "<a><e><3></3></e><d><b><4></4></b></d></a>", r_a);                                                // 213
  assert_dump(test, "<b><4></4></b>", r_b);                                                                            // 214
  assert_dump(test, "<c><a><e><3></3></e><d><b><4></4></b></d></a></c>", r_c);                                         // 215
  assert_dump(test, "<d><b><4></4></b></d>", r_d);                                                                     // 216
  assert_dump(test, "<e><3></3></e>", r_e);                                                                            // 217
  assert_dump(test, "<f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f>", r_f);                                  // 218
                                                                                                                       // 219
  assert_contained(r_f, {range: r_f, children: [{range: r_c, children: [{range: r_a, children: [{range: r_e, children: []},{range: r_d, children: [{range: r_b, children: []}]}]}]}]});
                                                                                                                       // 221
  var r_g = create("g", f.childNodes[0], f.childNodes[3]);                                                             // 222
  var r_h = create("h", f.childNodes[0], f.childNodes[3]);                                                             // 223
  var r_i = create("i", f.childNodes[1], f.childNodes[3]);                                                             // 224
  assert_dump(test, "<h><g><1></1><i><2></2><f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f></i></g></h><5></5>", f);
  assert_dump(test, "<a><e><3></3></e><d><b><4></4></b></d></a>", r_a);                                                // 226
  assert_dump(test, "<b><4></4></b>", r_b);                                                                            // 227
  assert_dump(test, "<c><a><e><3></3></e><d><b><4></4></b></d></a></c>", r_c);                                         // 228
  assert_dump(test, "<d><b><4></4></b></d>", r_d);                                                                     // 229
  assert_dump(test, "<e><3></3></e>", r_e);                                                                            // 230
  assert_dump(test, "<f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f>", r_f);                                  // 231
  assert_dump(test, "<g><1></1><i><2></2><f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f></i></g>", r_g);      // 232
  assert_dump(test, "<h><g><1></1><i><2></2><f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f></i></g></h>", r_h);
  assert_dump(test, "<i><2></2><f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f></i>", r_i);                    // 234
                                                                                                                       // 235
  var f2 = frag("<div id=6></div><div id=7></div><div id=8></div>");                                                   // 236
  f2.childNodes[1].appendChild(f);                                                                                     // 237
  assert_dump(test, "", f);                                                                                            // 238
  assert_dump(test, "<6></6><7><h><g><1></1><i><2></2><f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f></i></g></h><5></5></7><8></8>", f2);
  assert_dump(test, "<a><e><3></3></e><d><b><4></4></b></d></a>", r_a);                                                // 240
  assert_dump(test, "<b><4></4></b>", r_b);                                                                            // 241
  assert_dump(test, "<c><a><e><3></3></e><d><b><4></4></b></d></a></c>", r_c);                                         // 242
  assert_dump(test, "<d><b><4></4></b></d>", r_d);                                                                     // 243
  assert_dump(test, "<e><3></3></e>", r_e);                                                                            // 244
  assert_dump(test, "<f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f>", r_f);                                  // 245
  assert_dump(test, "<g><1></1><i><2></2><f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f></i></g>", r_g);      // 246
  assert_dump(test, "<h><g><1></1><i><2></2><f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f></i></g></h>", r_h);
  assert_dump(test, "<i><2></2><f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f></i>", r_i);                    // 248
                                                                                                                       // 249
  var r_j = create("j", f2.childNodes[1], f2.childNodes[2]);                                                           // 250
  var r_k = create("k", f2.childNodes[0], f2.childNodes[2]);                                                           // 251
  var r_l = create("l", f2.childNodes[0], f2.childNodes[2]);                                                           // 252
  assert_dump(test, "<l><k><6></6><j><7><h><g><1></1><i><2></2><f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f></i></g></h><5></5></7><8></8></j></k></l>", f2);
                                                                                                                       // 254
  var f3 = frag("<div id=9></div><div id=10></div><div id=11></div>");                                                 // 255
  var r_m = create("m", f3.childNodes[0], f3.childNodes[2]);                                                           // 256
  var r_n = create("n", f3.childNodes[0], f3.childNodes[0]);                                                           // 257
  var r_o = create("o", f3.childNodes[0], f3.childNodes[0]);                                                           // 258
  assert_dump(test, "<m><o><n><9></9></n></o><10></10><11></11></m>", f3);                                             // 259
                                                                                                                       // 260
  var ret1 = r_i.replaceContents(f3, true);                                                                            // 261
  assert_dump(test, "", f3);                                                                                           // 262
  assert_dump(test, "<2></2><f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f>", ret1);                          // 263
  assert_dump(test, "<l><k><6></6><j><7><h><g><1></1><i><m><o><n><9></9></n></o><10></10><11></11></m></i></g></h><5></5></7><8></8></j></k></l>", f2);
  assert_dump(test, "<a><e><3></3></e><d><b><4></4></b></d></a>", r_a);                                                // 265
  assert_dump(test, "<b><4></4></b>", r_b);                                                                            // 266
  assert_dump(test, "<c><a><e><3></3></e><d><b><4></4></b></d></a></c>", r_c);                                         // 267
  assert_dump(test, "<d><b><4></4></b></d>", r_d);                                                                     // 268
  assert_dump(test, "<e><3></3></e>", r_e);                                                                            // 269
  assert_dump(test, "<f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f>", r_f);                                  // 270
  assert_dump(test, "<g><1></1><i><m><o><n><9></9></n></o><10></10><11></11></m></i></g>", r_g);                       // 271
  assert_dump(test, "<h><g><1></1><i><m><o><n><9></9></n></o><10></10><11></11></m></i></g></h>", r_h);                // 272
  assert_dump(test, "<i><m><o><n><9></9></n></o><10></10><11></11></m></i>",r_i);                                      // 273
  assert_dump(test, "<j><7><h><g><1></1><i><m><o><n><9></9></n></o><10></10><11></11></m></i></g></h><5></5></7><8></8></j>", r_j);
  assert_dump(test, "<k><6></6><j><7><h><g><1></1><i><m><o><n><9></9></n></o><10></10><11></11></m></i></g></h><5></5></7><8></8></j></k>", r_k);
  assert_dump(test, "<l><k><6></6><j><7><h><g><1></1><i><m><o><n><9></9></n></o><10></10><11></11></m></i></g></h><5></5></7><8></8></j></k></l>", r_l);
                                                                                                                       // 277
  r_h.destroy();                                                                                                       // 278
  assert_dump(test, "<l><k><6></6><j><7><g><1></1><i><m><o><n><9></9></n></o><10></10><11></11></m></i></g><5></5></7><8></8></j></k></l>", f2);
  r_m.destroy();                                                                                                       // 280
  assert_dump(test, "<l><k><6></6><j><7><g><1></1><i><o><n><9></9></n></o><10></10><11></11></i></g><5></5></7><8></8></j></k></l>", f2);
  r_n.destroy();                                                                                                       // 282
  assert_dump(test, "<l><k><6></6><j><7><g><1></1><i><o><9></9></o><10></10><11></11></i></g><5></5></7><8></8></j></k></l>", f2);
  r_j.destroy();                                                                                                       // 284
  assert_dump(test, "<l><k><6></6><7><g><1></1><i><o><9></9></o><10></10><11></11></i></g><5></5></7><8></8></k></l>", f2);
  r_o.destroy();                                                                                                       // 286
  assert_dump(test, "<l><k><6></6><7><g><1></1><i><9></9><10></10><11></11></i></g><5></5></7><8></8></k></l>", f2);   // 287
  r_g.destroy();                                                                                                       // 288
  assert_dump(test, "<l><k><6></6><7><1></1><i><9></9><10></10><11></11></i><5></5></7><8></8></k></l>", f2);          // 289
  r_l.destroy();                                                                                                       // 290
  assert_dump(test, "<k><6></6><7><1></1><i><9></9><10></10><11></11></i><5></5></7><8></8></k>", f2);                 // 291
  r_i.destroy();                                                                                                       // 292
  assert_dump(test, "<k><6></6><7><1></1><9></9><10></10><11></11><5></5></7><8></8></k>", f2);                        // 293
  r_k.destroy();                                                                                                       // 294
  assert_dump(test, "<6></6><7><1></1><9></9><10></10><11></11><5></5></7><8></8>", f2);                               // 295
});                                                                                                                    // 296
                                                                                                                       // 297
Tinytest.add("liverange - deep visit", function (test) {                                                               // 298
                                                                                                                       // 299
  var f = frag("<div id=1><div id=2><div id=3><div id=4><div id=5></div></div></div></div></div>");                    // 300
                                                                                                                       // 301
  var dive = function (f, count) {                                                                                     // 302
    for (var i = 0; i < count; i ++)                                                                                   // 303
      f = f.firstChild;                                                                                                // 304
    return f;                                                                                                          // 305
  };                                                                                                                   // 306
                                                                                                                       // 307
  var r_a = create("a", dive(f, 5), dive(f, 5));                                                                       // 308
  var r_b = create("b", dive(f, 3), dive(f, 3));                                                                       // 309
  var r_c = create("c", dive(f, 2), dive(f, 2));                                                                       // 310
  var r_d = create("d", f);                                                                                            // 311
                                                                                                                       // 312
  assert_dump(test, "<d><1><c><2><b><3><4><a><5></5></a></4></3></b></2></c></1></d>",                                 // 313
              f);                                                                                                      // 314
                                                                                                                       // 315
  assert_contained(r_d,                                                                                                // 316
                   {range: r_d, children: [{range: r_c, children: [{range: r_b, children: [{range: r_a, children: []}]}]}]});
});                                                                                                                    // 318
                                                                                                                       // 319
Tinytest.add("liverange - create inner", function (test) {                                                             // 320
  // Basics                                                                                                            // 321
                                                                                                                       // 322
  var f = frag("<div id=1></div><div id=2></div><div id=3></div><div id=4></div><div id=5></div>");                    // 323
  assert_dump(test, "<1></1><2></2><3></3><4></4><5></5>", f);                                                         // 324
                                                                                                                       // 325
  var r_a = create("a", f.childNodes[2], f.childNodes[4], true);                                                       // 326
  assert_dump(test, "<1></1><2></2><a><3></3><4></4><5></5></a>", f);                                                  // 327
                                                                                                                       // 328
  var r_b = create("b", f.childNodes[2], f.childNodes[4], true);                                                       // 329
  assert_dump(test, "<1></1><2></2><a><b><3></3><4></4><5></5></b></a>", f);                                           // 330
                                                                                                                       // 331
  var r_c = create("c", f.childNodes[2], f.childNodes[4]);                                                             // 332
  assert_dump(test, "<1></1><2></2><c><a><b><3></3><4></4><5></5></b></a></c>", f);                                    // 333
                                                                                                                       // 334
  // [{[a] [b]}]                                                                                                       // 335
                                                                                                                       // 336
  var r_d = create("d", f.childNodes[0], f.childNodes[0]);                                                             // 337
  var r_e = create("e", f.childNodes[1], f.childNodes[1]);                                                             // 338
  var r_f = create("f", f.childNodes[0], f.childNodes[1]);                                                             // 339
  assert_dump(test, "<f><d><1></1></d><e><2></2></e></f><c><a><b><3></3><4></4><5></5></b></a></c>", f);               // 340
                                                                                                                       // 341
  var r_g = create("g", f.childNodes[0], f.childNodes[1], true);                                                       // 342
  assert_dump(test, "<f><g><d><1></1></d><e><2></2></e></g></f><c><a><b><3></3><4></4><5></5></b></a></c>", f);        // 343
                                                                                                                       // 344
  var r_h = create("h", f.childNodes[0], f.childNodes[1]);                                                             // 345
  assert_dump(test, "<h><f><g><d><1></1></d><e><2></2></e></g></f></h><c><a><b><3></3><4></4><5></5></b></a></c>", f); // 346
                                                                                                                       // 347
  var r_i = create("i", f.childNodes[0], f.childNodes[1], true);                                                       // 348
  assert_dump(test, "<h><f><g><i><d><1></1></d><e><2></2></e></i></g></f></h><c><a><b><3></3><4></4><5></5></b></a></c>", f);
                                                                                                                       // 350
  var r_j = create("j", f.childNodes[0], f.childNodes[0], true);                                                       // 351
  assert_dump(test, "<h><f><g><i><d><j><1></1></j></d><e><2></2></e></i></g></f></h><c><a><b><3></3><4></4><5></5></b></a></c>", f);
                                                                                                                       // 353
  var r_k = create("k", f.childNodes[0], f.childNodes[0]);                                                             // 354
  assert_dump(test, "<h><f><g><i><k><d><j><1></1></j></d></k><e><2></2></e></i></g></f></h><c><a><b><3></3><4></4><5></5></b></a></c>", f);
                                                                                                                       // 356
  var r_l = create("l", f.childNodes[0], f.childNodes[1], true);                                                       // 357
  assert_dump(test, "<h><f><g><i><l><k><d><j><1></1></j></d></k><e><2></2></e></l></i></g></f></h><c><a><b><3></3><4></4><5></5></b></a></c>", f);
  assert_dump(test, "<c><a><b><3></3><4></4><5></5></b></a></c>", r_c);                                                // 359
  assert_dump(test, "<b><3></3><4></4><5></5></b>", r_b);                                                              // 360
  assert_dump(test, "<a><b><3></3><4></4><5></5></b></a>", r_a);                                                       // 361
  assert_dump(test, "<d><j><1></1></j></d>", r_d);                                                                     // 362
  assert_dump(test, "<e><2></2></e>", r_e);                                                                            // 363
  assert_dump(test, "<f><g><i><l><k><d><j><1></1></j></d></k><e><2></2></e></l></i></g></f>", r_f);                    // 364
  assert_dump(test, "<g><i><l><k><d><j><1></1></j></d></k><e><2></2></e></l></i></g>", r_g);                           // 365
  assert_dump(test, "<h><f><g><i><l><k><d><j><1></1></j></d></k><e><2></2></e></l></i></g></f></h>", r_h);             // 366
  assert_dump(test, "<i><l><k><d><j><1></1></j></d></k><e><2></2></e></l></i>", r_i);                                  // 367
  assert_dump(test, "<j><1></1></j>", r_j);                                                                            // 368
  assert_dump(test, "<k><d><j><1></1></j></d></k>", r_k);                                                              // 369
  assert_dump(test, "<l><k><d><j><1></1></j></d></k><e><2></2></e></l>", r_l);                                         // 370
                                                                                                                       // 371
  // [{a b [c]}]                                                                                                       // 372
  f = frag("<div id=1></div><div id=2></div><div id=3></div>");                                                        // 373
  r_a = create("a", f.childNodes[2], f.childNodes[2]);                                                                 // 374
  r_b = create("b", f.childNodes[0], f.childNodes[2]);                                                                 // 375
  r_c = create("c", f.childNodes[0], f.childNodes[2], true);                                                           // 376
  assert_dump(test, "<b><c><1></1><2></2><a><3></3></a></c></b>", f);                                                  // 377
                                                                                                                       // 378
  // [{[a] b c}]                                                                                                       // 379
                                                                                                                       // 380
  f = frag("<div id=1></div><div id=2></div><div id=3></div>");                                                        // 381
  r_a = create("a", f.childNodes[0], f.childNodes[0]);                                                                 // 382
  r_b = create("b", f.childNodes[0], f.childNodes[2]);                                                                 // 383
  r_c = create("c", f.childNodes[0], f.childNodes[2], true);                                                           // 384
  assert_dump(test, "<b><c><a><1></1></a><2></2><3></3></c></b>", f);                                                  // 385
                                                                                                                       // 386
  // [{[a b] c}]                                                                                                       // 387
                                                                                                                       // 388
  f = frag("<div id=1></div><div id=2></div><div id=3></div>");                                                        // 389
  r_a = create("a", f.childNodes[0], f.childNodes[1]);                                                                 // 390
  r_b = create("b", f.childNodes[0], f.childNodes[2]);                                                                 // 391
  r_c = create("c", f.childNodes[0], f.childNodes[2], true);                                                           // 392
  assert_dump(test, "<b><c><a><1></1><2></2></a><3></3></c></b>", f);                                                  // 393
                                                                                                                       // 394
  // Cases where start and end have no common ranges, and so the                                                       // 395
  // balance counter will have to run                                                                                  // 396
                                                                                                                       // 397
  f = frag("<div id=1></div><div id=2></div><div id=3></div>");                                                        // 398
  r_a = create("a", f.childNodes[0], f.childNodes[0]);                                                                 // 399
  r_b = create("b", f.childNodes[0], f.childNodes[2]);                                                                 // 400
  assert_dump(test, "<b><a><1></1></a><2></2><3></3></b>", f);                                                         // 401
                                                                                                                       // 402
  f = frag("<div id=1></div><div id=2></div><div id=3></div>");                                                        // 403
  r_a = create("a", f.childNodes[0], f.childNodes[2]);                                                                 // 404
  r_b = create("b", f.childNodes[0], f.childNodes[0]);                                                                 // 405
  assert_dump(test, "<a><b><1></1></b><2></2><3></3></a>", f);                                                         // 406
                                                                                                                       // 407
  f = frag("<div id=1></div><div id=2></div><div id=3></div>");                                                        // 408
  r_a = create("a", f.childNodes[2], f.childNodes[2]);                                                                 // 409
  r_b = create("b", f.childNodes[0], f.childNodes[2]);                                                                 // 410
  assert_dump(test, "<b><1></1><2></2><a><3></3></a></b>", f);                                                         // 411
                                                                                                                       // 412
  f = frag("<div id=1></div><div id=2></div><div id=3></div>");                                                        // 413
  r_a = create("a", f.childNodes[0], f.childNodes[2]);                                                                 // 414
  r_b = create("b", f.childNodes[2], f.childNodes[2]);                                                                 // 415
  assert_dump(test, "<a><1></1><2></2><b><3></3></b></a>", f);                                                         // 416
                                                                                                                       // 417
  f = frag("<div id=1></div><div id=2></div><div id=3></div>");                                                        // 418
  r_a = create("a", f.childNodes[0], f.childNodes[0]);                                                                 // 419
  r_b = create("b", f.childNodes[0], f.childNodes[0]);                                                                 // 420
  r_c = create("c", f.childNodes[2], f.childNodes[2]);                                                                 // 421
  r_d = create("d", f.childNodes[2], f.childNodes[2]);                                                                 // 422
  r_e = create("e", f.childNodes[0], f.childNodes[2]);                                                                 // 423
  assert_dump(test, "<e><b><a><1></1></a></b><2></2><d><c><3></3></c></d></e>", f);                                    // 424
                                                                                                                       // 425
  f = frag("<div id=1></div><div id=2></div><div id=3></div>");                                                        // 426
  r_a = create("a", f.childNodes[0], f.childNodes[0]);                                                                 // 427
  r_b = create("b", f.childNodes[0], f.childNodes[0]);                                                                 // 428
  r_c = create("c", f.childNodes[2], f.childNodes[2]);                                                                 // 429
  r_e = create("e", f.childNodes[0], f.childNodes[2]);                                                                 // 430
  assert_dump(test, "<e><b><a><1></1></a></b><2></2><c><3></3></c></e>", f);                                           // 431
                                                                                                                       // 432
  try_all_permutations(                                                                                                // 433
    function () {                                                                                                      // 434
      f = frag("<div id=1></div><div id=2></div><div id=3></div>");                                                    // 435
    },                                                                                                                 // 436
    [                                                                                                                  // 437
      function () { create("a", f.childNodes[1], f.childNodes[2]); },                                                  // 438
      function () { create("b", f.childNodes[2], f.childNodes[2]); },                                                  // 439
      function () { create("c", f.childNodes[0], f.childNodes[2]); }                                                   // 440
    ],                                                                                                                 // 441
    function () {                                                                                                      // 442
      assert_dump(test, "<c><1></1><a><2></2><b><3></3></b></a></c>", f);                                              // 443
    }                                                                                                                  // 444
  );                                                                                                                   // 445
                                                                                                                       // 446
  try_all_permutations(                                                                                                // 447
    function () {                                                                                                      // 448
      f = frag("<div id=1></div><div id=2></div><div id=3></div>");                                                    // 449
    },                                                                                                                 // 450
    [                                                                                                                  // 451
      function () { create("a", f.childNodes[0], f.childNodes[0]); },                                                  // 452
      function () { create("b", f.childNodes[0], f.childNodes[1]); },                                                  // 453
      function () { create("c", f.childNodes[0], f.childNodes[2]); }                                                   // 454
    ],                                                                                                                 // 455
    function () {                                                                                                      // 456
      assert_dump(test, "<c><b><a><1></1></a><2></2></b><3></3></c>", f);                                              // 457
    }                                                                                                                  // 458
  );                                                                                                                   // 459
});                                                                                                                    // 460
                                                                                                                       // 461
var makeTestPattern = function(codedStr) {                                                                             // 462
  codedStr = codedStr.replace(/\*/g, '[]');                                                                            // 463
                                                                                                                       // 464
  var self = {};                                                                                                       // 465
  self.tag = '_foo';                                                                                                   // 466
  self.ranges = {};                                                                                                    // 467
                                                                                                                       // 468
  // set up self.ranges                                                                                                // 469
  var curNode = document.createDocumentFragment();                                                                     // 470
  var starts = [];                                                                                                     // 471
  for(var i=0; i<codedStr.length; i++) {                                                                               // 472
    var c = codedStr.charAt(i);                                                                                        // 473
    if (/[A-Z]/.test(c)) {                                                                                             // 474
      // open range                                                                                                    // 475
      starts.push([curNode, curNode.childNodes.length]);                                                               // 476
    } else if (/[a-z]/.test(c)) {                                                                                      // 477
      // close range                                                                                                   // 478
      var start = starts.pop();                                                                                        // 479
      var range =                                                                                                      // 480
            new LiveRange(                                                                                             // 481
              self.tag, start[0].childNodes[start[1]],                                                                 // 482
              start[0].lastChild);                                                                                     // 483
      range.letter = c.toUpperCase();                                                                                  // 484
      self.ranges[range.letter] = range;                                                                               // 485
    } else if (c === '[') {                                                                                            // 486
      curNode.appendChild(document.createElement("DIV"));                                                              // 487
      curNode = curNode.lastChild;                                                                                     // 488
    } else if (c === ']') {                                                                                            // 489
      // close node                                                                                                    // 490
      curNode = curNode.parentNode;                                                                                    // 491
    }                                                                                                                  // 492
  }                                                                                                                    // 493
                                                                                                                       // 494
  self.frag = curNode;                                                                                                 // 495
                                                                                                                       // 496
  self.path = function(/*args*/) {                                                                                     // 497
    var node = self.frag;                                                                                              // 498
    _.each(arguments, function(i) {                                                                                    // 499
      node = node.childNodes[i];                                                                                       // 500
    });                                                                                                                // 501
    return node;                                                                                                       // 502
  };                                                                                                                   // 503
                                                                                                                       // 504
  self.findRange = function(node) {                                                                                    // 505
    return LiveRange.findRange(self.tag, node);                                                                        // 506
  };                                                                                                                   // 507
                                                                                                                       // 508
  self.currentString = function() {                                                                                    // 509
    var buf = [];                                                                                                      // 510
    var tempRange = new LiveRange(self.tag, self.frag);                                                                // 511
    tempRange.visit(function(isStart, range) {                                                                         // 512
      buf.push(isStart ?                                                                                               // 513
               range.letter.toUpperCase() :                                                                            // 514
               range.letter.toLowerCase());                                                                            // 515
    }, function(isStart, node) {                                                                                       // 516
      buf.push(isStart ? '[' : ']');                                                                                   // 517
    });                                                                                                                // 518
    tempRange.destroy();                                                                                               // 519
                                                                                                                       // 520
    return buf.join('').replace(/\[\]/g, '*');                                                                         // 521
  };                                                                                                                   // 522
                                                                                                                       // 523
  return self;                                                                                                         // 524
};                                                                                                                     // 525
                                                                                                                       // 526
Tinytest.add("liverange - findParent", function(test) {                                                                // 527
  var str = "I*[[AB[H***FDE*ed*fG*gh]*baC*c*]]i*";                                                                     // 528
  var pat = makeTestPattern(str);                                                                                      // 529
  test.equal(pat.currentString(), str);                                                                                // 530
                                                                                                                       // 531
  var ranges = pat.ranges;                                                                                             // 532
                                                                                                                       // 533
  test.equal(ranges.E.findParent().letter, 'D');                                                                       // 534
  test.equal(ranges.D.findParent().letter, 'F');                                                                       // 535
  test.equal(ranges.F.findParent().letter, 'H');                                                                       // 536
  test.equal(ranges.H.findParent().letter, 'B');                                                                       // 537
  test.equal(ranges.B.findParent().letter, 'A');                                                                       // 538
  test.equal(ranges.A.findParent().letter, 'I');                                                                       // 539
  test.equal(ranges.I.findParent(), null);                                                                             // 540
                                                                                                                       // 541
  test.equal(ranges.E.findParent(true).letter, 'D');                                                                   // 542
  test.equal(ranges.D.findParent(true).letter, 'F');                                                                   // 543
  test.equal(ranges.F.findParent(true).letter, 'H');                                                                   // 544
  test.equal(ranges.H.findParent(true), null);                                                                         // 545
  test.equal(ranges.B.findParent(true).letter, 'A');                                                                   // 546
  test.equal(ranges.A.findParent(true), null);                                                                         // 547
  test.equal(ranges.I.findParent(true), null);                                                                         // 548
                                                                                                                       // 549
                                                                                                                       // 550
  test.equal(pat.findRange(pat.path(0)).letter, 'I');                                                                  // 551
  test.equal(pat.findRange(pat.path(1)).letter, 'I');                                                                  // 552
  test.equal(pat.findRange(pat.path(2)), null);                                                                        // 553
                                                                                                                       // 554
  test.equal(pat.findRange(pat.path(1, 0)).letter, 'I');                                                               // 555
  test.equal(pat.findRange(pat.path(1, 0, 0)).letter, 'B');                                                            // 556
  test.equal(pat.findRange(pat.path(1, 0, 1)).letter, 'B');                                                            // 557
  test.equal(pat.findRange(pat.path(1, 0, 2)).letter, 'C');                                                            // 558
  test.equal(pat.findRange(pat.path(1, 0, 3)).letter, 'I');                                                            // 559
                                                                                                                       // 560
  test.equal(pat.findRange(pat.path(1, 0, 0, 0)).letter, 'H');                                                         // 561
  test.equal(pat.findRange(pat.path(1, 0, 0, 1)).letter, 'H');                                                         // 562
  test.equal(pat.findRange(pat.path(1, 0, 0, 2)).letter, 'H');                                                         // 563
  test.equal(pat.findRange(pat.path(1, 0, 0, 3)).letter, 'E');                                                         // 564
  test.equal(pat.findRange(pat.path(1, 0, 0, 4)).letter, 'F');                                                         // 565
  test.equal(pat.findRange(pat.path(1, 0, 0, 5)).letter, 'G');                                                         // 566
                                                                                                                       // 567
});                                                                                                                    // 568
                                                                                                                       // 569
Tinytest.add("liverange - destroy", function(test) {                                                                   // 570
  var str = "I*[[AB[H***FDE*ed*fG*gh]*baC*c*]]J*ji*";                                                                  // 571
  var pat = makeTestPattern(str);                                                                                      // 572
                                                                                                                       // 573
  pat.ranges.D.destroy();                                                                                              // 574
  test.equal(pat.currentString(), str.replace(/[Dd]/g, ''));                                                           // 575
  pat.ranges.B.destroy();                                                                                              // 576
  test.equal(pat.currentString(), str.replace(/[DdBb]/g, ''));                                                         // 577
  pat.ranges.A.destroy();                                                                                              // 578
  test.equal(pat.currentString(), str.replace(/[DdBbAa]/g, ''));                                                       // 579
                                                                                                                       // 580
  // recursive destroy                                                                                                 // 581
  pat.ranges.F.destroy(true);                                                                                          // 582
  test.equal(pat.currentString(),                                                                                      // 583
             "I*[[[H*****G*gh]*C*c*]]J*ji*");                                                                          // 584
  pat.ranges.I.destroy(true);                                                                                          // 585
  test.equal(pat.currentString(),                                                                                      // 586
             "*[[[******]***]]**");                                                                                    // 587
                                                                                                                       // 588
  var childrenHaveNoTags = function(node) {                                                                            // 589
    for(var n = node.firstChild; n; n = n.nextSibling) {                                                               // 590
      test.isFalse(node[pat.tag]);                                                                                     // 591
      if (n.firstChild)                                                                                                // 592
        childrenHaveNoTags(n); // recurse                                                                              // 593
    }                                                                                                                  // 594
  };                                                                                                                   // 595
                                                                                                                       // 596
  childrenHaveNoTags(pat.frag);                                                                                        // 597
                                                                                                                       // 598
  // test recursive on single node                                                                                     // 599
  var frag = document.createDocumentFragment();                                                                        // 600
  var txt = document.createComment("pudding");                                                                         // 601
  frag.appendChild(txt);                                                                                               // 602
  var rng5 = new LiveRange('_pudding', txt);                                                                           // 603
  var rng4 = new LiveRange('_pudding', txt);                                                                           // 604
  var rng3 = new LiveRange('_pudding', txt);                                                                           // 605
  var rng2 = new LiveRange('_pudding', txt);                                                                           // 606
  var rng1 = new LiveRange('_pudding', txt);                                                                           // 607
  rng1.num = 1;                                                                                                        // 608
  rng2.num = 2;                                                                                                        // 609
  rng3.num = 3;                                                                                                        // 610
  rng4.num = 4;                                                                                                        // 611
  rng5.num = 5;                                                                                                        // 612
  // kill an inner range                                                                                               // 613
  rng4.destroy(true);                                                                                                  // 614
  // check that outer ranges are still there                                                                           // 615
  var buf = [];                                                                                                        // 616
  rng1.visit(function(isStart, r) {                                                                                    // 617
    buf.push([isStart, r.num]);                                                                                        // 618
  });                                                                                                                  // 619
  test.equal(buf, [[true, 2], [true, 3], [false, 3], [false, 2]]);                                                     // 620
});                                                                                                                    // 621
                                                                                                                       // 622
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);
