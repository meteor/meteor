Tinytest.add('deps - run', function (test) {
  var d = new Deps.Dependency;
  var x = 0;
  var handle = Deps.autorun(function (handle) {
    d.depend();
    ++x;
  });
  test.equal(x, 1);
  Deps.flush();
  test.equal(x, 1);
  d.changed();
  test.equal(x, 1);
  Deps.flush();
  test.equal(x, 2);
  d.changed();
  test.equal(x, 2);
  Deps.flush();
  test.equal(x, 3);
  d.changed();
  // Prevent the function from running further.
  handle.stop();
  Deps.flush();
  test.equal(x, 3);
  d.changed();
  Deps.flush();
  test.equal(x, 3);

  Deps.autorun(function (internalHandle) {
    d.depend();
    ++x;
    if (x == 6)
      internalHandle.stop();
  });
  test.equal(x, 4);
  d.changed();
  Deps.flush();
  test.equal(x, 5);
  d.changed();
  // Increment to 6 and stop.
  Deps.flush();
  test.equal(x, 6);
  d.changed();
  Deps.flush();
  // Still 6!
  test.equal(x, 6);

  test.throws(function () {
    Deps.autorun();
  });
  test.throws(function () {
    Deps.autorun({});
  });
});

Tinytest.add("deps - nested run", function (test) {
  var a = new Deps.Dependency;
  var b = new Deps.Dependency;
  var c = new Deps.Dependency;
  var d = new Deps.Dependency;
  var e = new Deps.Dependency;
  var f = new Deps.Dependency;

  var buf = "";

  var c1 = Deps.autorun(function () {
    a.depend();
    buf += 'a';
    Deps.autorun(function () {
      b.depend();
      buf += 'b';
      Deps.autorun(function () {
        c.depend();
        buf += 'c';
        var c2 = Deps.autorun(function () {
          d.depend();
          buf += 'd';
          Deps.autorun(function () {
            e.depend();
            buf += 'e';
            Deps.autorun(function () {
              f.depend();
              buf += 'f';
            });
          });
          Deps.onInvalidate(function () {
            // only run once
            c2.stop();
          });
        });
      });
    });
    Deps.onInvalidate(function (c1) {
      c1.stop();
    });
  });

  var expect = function (str) {
    test.equal(buf, str);
    buf = "";
  };

  expect('abcdef');

  b.changed();
  expect(''); // didn't flush yet
  Deps.flush();
  expect('bcdef');

  c.changed();
  Deps.flush();
  expect('cdef');

  var changeAndExpect = function (v, str) {
    v.changed();
    Deps.flush();
    expect(str);
  };

  // should cause running
  changeAndExpect(e, 'ef');
  changeAndExpect(f, 'f');
  // invalidate inner context
  changeAndExpect(d, '');
  // no more running!
  changeAndExpect(e, '');
  changeAndExpect(f, '');
  // rerun C
  changeAndExpect(c, 'cdef');
  changeAndExpect(e, 'ef');
  changeAndExpect(f, 'f');
  // rerun B
  changeAndExpect(b, 'bcdef');
  changeAndExpect(e, 'ef');
  changeAndExpect(f, 'f');
  // kill A
  a.changed();
  changeAndExpect(f, '');
  changeAndExpect(e, '');
  changeAndExpect(d, '');
  changeAndExpect(c, '');
  changeAndExpect(b, '');
  changeAndExpect(a, '');

  test.isFalse(a.hasDependents());
  test.isFalse(b.hasDependents());
  test.isFalse(c.hasDependents());
  test.isFalse(d.hasDependents());
  test.isFalse(e.hasDependents());
  test.isFalse(f.hasDependents());
});

Tinytest.add("deps - flush", function (test) {

  var buf = "";

  var c1 = Deps.autorun(function (c) {
    buf += 'a';
    // invalidate first time
    if (c.firstRun)
      c.invalidate();
  });

  test.equal(buf, 'a');
  Deps.flush();
  test.equal(buf, 'aa');
  Deps.flush();
  test.equal(buf, 'aa');
  c1.stop();
  Deps.flush();
  test.equal(buf, 'aa');

  //////

  buf = "";

  var c2 = Deps.autorun(function (c) {
    buf += 'a';
    // invalidate first time
    if (c.firstRun)
      c.invalidate();

    Deps.onInvalidate(function () {
      buf += "*";
    });
  });

  test.equal(buf, 'a*');
  Deps.flush();
  test.equal(buf, 'a*a');
  c2.stop();
  test.equal(buf, 'a*a*');
  Deps.flush();
  test.equal(buf, 'a*a*');

  /////
  // Can flush a diferent run from a run;
  // no current computation in afterFlush

  buf = "";

  var c3 = Deps.autorun(function (c) {
    buf += 'a';
    // invalidate first time
    if (c.firstRun)
      c.invalidate();
    Deps.afterFlush(function () {
      buf += (Deps.active ? "1" : "0");
    });
  });

  Deps.afterFlush(function () {
    buf += 'c';
  });

  var c4 = Deps.autorun(function (c) {
    c4 = c;
    buf += 'b';
  });

  Deps.flush();
  test.equal(buf, 'aba0c0');
  c3.stop();
  c4.stop();
  Deps.flush();

  // cases where flush throws

  var ran = false;
  Deps.afterFlush(function (arg) {
    ran = true;
    test.equal(typeof arg, 'undefined');
    test.throws(function () {
      Deps.flush(); // illegal nested flush
    });
  });

  Deps.flush();
  test.isTrue(ran);

  test.throws(function () {
    Deps.autorun(function () {
      Deps.flush(); // illegal to flush from a computation
    });
  });
});

Tinytest.add("deps - lifecycle", function (test) {

  test.isFalse(Deps.active);
  test.equal(null, Deps.currentComputation);

  var runCount = 0;
  var firstRun = true;
  var buf = [];
  var cbId = 1;
  var makeCb = function () {
    var id = cbId++;
    return function () {
      buf.push(id);
    };
  };

  var shouldStop = false;

  var c1 = Deps.autorun(function (c) {
    test.isTrue(Deps.active);
    test.equal(c, Deps.currentComputation);
    test.equal(c.stopped, false);
    test.equal(c.invalidated, false);
      test.equal(c.firstRun, firstRun);

    Deps.onInvalidate(makeCb()); // 1, 6, ...
    Deps.afterFlush(makeCb()); // 2, 7, ...

    Deps.autorun(function (x) {
      x.stop();
      c.onInvalidate(makeCb()); // 3, 8, ...

      Deps.onInvalidate(makeCb()); // 4, 9, ...
      Deps.afterFlush(makeCb()); // 5, 10, ...
    });
    runCount++;

    if (shouldStop)
      c.stop();
  });

  firstRun = false;

  test.equal(runCount, 1);

  test.equal(buf, [4]);
  c1.invalidate();
  test.equal(runCount, 1);
  test.equal(c1.invalidated, true);
  test.equal(c1.stopped, false);
  test.equal(buf, [4, 1, 3]);

  Deps.flush();

  test.equal(runCount, 2);
  test.equal(c1.invalidated, false);
  test.equal(buf, [4, 1, 3, 9, 2, 5, 7, 10]);

  // test self-stop
  buf.length = 0;
  shouldStop = true;
  c1.invalidate();
  test.equal(buf, [6, 8]);
  Deps.flush();
  test.equal(buf, [6, 8, 14, 11, 13, 12, 15]);

});

Tinytest.add("deps - onInvalidate", function (test) {
  var buf = "";

  var c1 = Deps.autorun(function () {
    buf += "*";
  });

  var append = function (x) {
    return function () {
      test.isFalse(Deps.active);
      buf += x;
    };
  };

  c1.onInvalidate(append('a'));
  c1.onInvalidate(append('b'));
  test.equal(buf, '*');
  Deps.autorun(function (me) {
    Deps.onInvalidate(append('z'));
    me.stop();
    test.equal(buf, '*z');
    c1.invalidate();
  });
  test.equal(buf, '*zab');
  c1.onInvalidate(append('c'));
  c1.onInvalidate(append('d'));
  test.equal(buf, '*zabcd');
  Deps.flush();
  test.equal(buf, '*zabcd*');

  // afterFlush ordering
  buf = '';
  c1.onInvalidate(append('a'));
  c1.onInvalidate(append('b'));
  Deps.afterFlush(function () {
    append('x')();
    c1.onInvalidate(append('c'));
    c1.invalidate();
    Deps.afterFlush(function () {
      append('y')();
      c1.onInvalidate(append('d'));
      c1.invalidate();
    });
  });
  Deps.afterFlush(function () {
    append('z')();
    c1.onInvalidate(append('e'));
    c1.invalidate();
  });

  test.equal(buf, '');
  Deps.flush();
  test.equal(buf, 'xabc*ze*yd*');

  buf = "";
  c1.onInvalidate(append('m'));
  c1.stop();
  test.equal(buf, 'm');
  Deps.flush();
});

Tinytest.add('deps - invalidate at flush time', function (test) {
  // Test this sentence of the docs: Functions are guaranteed to be
  // called at a time when there are no invalidated computations that
  // need rerunning.

  var buf = [];

  Deps.afterFlush(function () {
    buf.push('C');
  });

  // When c1 is invalidated, it invalidates c2, then stops.
  var c1 = Deps.autorun(function (c) {
    if (! c.firstRun) {
      buf.push('A');
      c2.invalidate();
      c.stop();
    }
  });

  var c2 = Deps.autorun(function (c) {
    if (! c.firstRun) {
      buf.push('B');
      c.stop();
    }
  });

  // Invalidate c1.  If all goes well, the re-running of
  // c2 should happen before the afterFlush.
  c1.invalidate();
  Deps.flush();

  test.equal(buf.join(''), 'ABC');

});

Tinytest.add('deps - throwFirstError', function (test) {
  var d = new Deps.Dependency;
  Deps.autorun(function (c) {
    d.depend();

    if (!c.firstRun)
      throw new Error("foo");
  });

  d.changed();
  // doesn't throw; logs instead.
  Meteor._suppress_log(1);
  Deps.flush();

  d.changed();
  test.throws(function () {
    Deps.flush({_throwFirstError: true});
  }, /foo/);
});
