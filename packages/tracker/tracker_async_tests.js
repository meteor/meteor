Tinytest.addAsync('tracker async - run', async function (test) {
  var d = new TrackerAsync.Dependency;
  var x = 0;
  var handle = await TrackerAsync.autorun(function (handle) {
    d.depend();
    ++x;
  });
  test.equal(x, 1);
  await TrackerAsync.flush();
  test.equal(x, 1);
  d.changed();
  test.equal(x, 1);
  await TrackerAsync.flush();
  test.equal(x, 2);
  d.changed();
  test.equal(x, 2);
  await TrackerAsync.flush();
  test.equal(x, 3);
  d.changed();
  // Prevent the function from running further.
  handle.stop();
  await TrackerAsync.flush();
  test.equal(x, 3);
  d.changed();
  await TrackerAsync.flush();
  test.equal(x, 3);

  await TrackerAsync.autorun(function (internalHandle) {
    d.depend();
    ++x;
    if (x == 6)
      internalHandle.stop();
  });
  test.equal(x, 4);
  d.changed();
  await TrackerAsync.flush();
  test.equal(x, 5);
  d.changed();
  // Increment to 6 and stop.
  await TrackerAsync.flush();
  test.equal(x, 6);
  d.changed();
  await TrackerAsync.flush();
  // Still 6!
  test.equal(x, 6);

  TrackerAsync.autorun().catch(test.throws);
  TrackerAsync.autorun({}).catch(test.throws);

});

Tinytest.addAsync("tracker async - nested run", async function (test) {
  var a = new TrackerAsync.Dependency;
  var b = new TrackerAsync.Dependency;
  var c = new TrackerAsync.Dependency;
  var d = new TrackerAsync.Dependency;
  var e = new TrackerAsync.Dependency;
  var f = new TrackerAsync.Dependency;

  var buf = "";

  var c1 = await TrackerAsync.autorun(async function () {
    a.depend();
    buf += 'a';
    await TrackerAsync.autorun(async function () {
      b.depend();
      buf += 'b';
      await TrackerAsync.autorun(async function () {
        c.depend();
        buf += 'c';
        var c2 = await TrackerAsync.autorun(async function () {
          d.depend();
          buf += 'd';
          await TrackerAsync.autorun(async function () {
            e.depend();
            buf += 'e';
            await TrackerAsync.autorun(function () {
              f.depend();
              buf += 'f';
            });
          });
          TrackerAsync.onInvalidate(function () {
            // only run once
            c2.stop();
          });
        });
      });
    });
    TrackerAsync.onInvalidate(function (c1) {
      c1.stop();
    });
  });

  var expect = function (str) {
    test.equal(buf, str);
    buf = "";
  };

  expect('abcdef');

  test.isTrue(a.hasDependents());
  test.isTrue(b.hasDependents());
  test.isTrue(c.hasDependents());
  test.isTrue(d.hasDependents());
  test.isTrue(e.hasDependents());
  test.isTrue(f.hasDependents());

  b.changed();
  expect(''); // didn't flush yet
  await TrackerAsync.flush();
  expect('bcdef');

  c.changed();
  await TrackerAsync.flush();
  expect('cdef');

  var changeAndExpect = async function (v, str) {
    v.changed();
    await TrackerAsync.flush();
    expect(str);
  };

  // should cause running
  await changeAndExpect(e, 'ef');
  await changeAndExpect(f, 'f');
  // invalidate inner context
  await changeAndExpect(d, '');
  // no more running!
  await changeAndExpect(e, '');
  await changeAndExpect(f, '');

  test.isTrue(a.hasDependents());
  test.isTrue(b.hasDependents());
  test.isTrue(c.hasDependents());
  test.isFalse(d.hasDependents());
  test.isFalse(e.hasDependents());
  test.isFalse(f.hasDependents());

  // rerun C
  await changeAndExpect(c, 'cdef');
  await changeAndExpect(e, 'ef');
  await changeAndExpect(f, 'f');
  // rerun B
  await changeAndExpect(b, 'bcdef');
  await changeAndExpect(e, 'ef');
  await changeAndExpect(f, 'f');

  test.isTrue(a.hasDependents());
  test.isTrue(b.hasDependents());
  test.isTrue(c.hasDependents());
  test.isTrue(d.hasDependents());
  test.isTrue(e.hasDependents());
  test.isTrue(f.hasDependents());

  // kill A
  a.changed();
  await changeAndExpect(f, '');
  await changeAndExpect(e, '');
  await changeAndExpect(d, '');
  await changeAndExpect(c, '');
  await changeAndExpect(b, '');
  await changeAndExpect(a, '');

  test.isFalse(a.hasDependents());
  test.isFalse(b.hasDependents());
  test.isFalse(c.hasDependents());
  test.isFalse(d.hasDependents());
  test.isFalse(e.hasDependents());
  test.isFalse(f.hasDependents());
});

Tinytest.addAsync("tracker async - flush", async function (test) {

  var buf = "";

  var c1 = await TrackerAsync.autorun(function (c) {
    buf += 'a';
    // invalidate first time
    if (c.firstRun)
      c.invalidate();
  });

  test.equal(buf, 'a');
  await TrackerAsync.flush();
  test.equal(buf, 'aa');
  await TrackerAsync.flush();
  test.equal(buf, 'aa');
  c1.stop();
  await TrackerAsync.flush();
  test.equal(buf, 'aa');

  //////

  buf = "";

  var c2 = await TrackerAsync.autorun(function (c) {
    buf += 'a';
    // invalidate first time
    if (c.firstRun)
      c.invalidate();

    TrackerAsync.onInvalidate(function () {
      buf += "*";
    });
  });

  test.equal(buf, 'a*');
  await TrackerAsync.flush();
  test.equal(buf, 'a*a');
  c2.stop();
  test.equal(buf, 'a*a*');
  await TrackerAsync.flush();
  test.equal(buf, 'a*a*');

  /////
  // Can flush a different run from a run;
  // no current computation in afterFlush

  buf = "";

  var c3 = await TrackerAsync.autorun(function (c) {
    buf += 'a';
    // invalidate first time
    if (c.firstRun)
      c.invalidate();
    TrackerAsync.afterFlush(function () {
      buf += (TrackerAsync.active ? "1" : "0");
    });
  });

  TrackerAsync.afterFlush(function () {
    buf += 'c';
  });

  var c4 = await TrackerAsync.autorun(function (c) {
    c4 = c;
    buf += 'b';
  });

  await TrackerAsync.flush();
  test.equal(buf, 'aba0c0');
  c3.stop();
  c4.stop();
  await TrackerAsync.flush();

  // cases where flush throws

  var ran = false;
  TrackerAsync.afterFlush(function (arg) {
    ran = true;
    test.equal(typeof arg, 'undefined');
    TrackerAsync.flush().catch(test.throws);
  });

  await TrackerAsync.flush();
  test.isTrue(ran);

  await TrackerAsync.autorun(function () {
    TrackerAsync.flush().catch(test.throws); // illegal to flush from a computation
  });

  await TrackerAsync.autorun(async function () {
    await TrackerAsync.autorun(function () {});
     TrackerAsync.flush().catch(test.throws);
  });
});

Tinytest.addAsync("tracker async - lifecycle", async function (test) {

  test.isFalse(TrackerAsync.active);
  test.equal(null, TrackerAsync.currentComputation);

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

  var c1 = await  TrackerAsync.autorun(function (c) {
    test.isTrue(TrackerAsync.active);
    test.equal(c, TrackerAsync.currentComputation);
    test.equal(c.stopped, false);
    test.equal(c.invalidated, false);
      test.equal(c.firstRun, firstRun);

    TrackerAsync.onInvalidate(makeCb()); // 1, 6, ...
    TrackerAsync.afterFlush(makeCb()); // 2, 7, ...

    TrackerAsync.autorun(function (x) {
      x.stop();
      c.onInvalidate(makeCb()); // 3, 8, ...

      TrackerAsync.onInvalidate(makeCb()); // 4, 9, ...
      TrackerAsync.afterFlush(makeCb()); // 5, 10, ...
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

  await TrackerAsync.flush();

  test.equal(runCount, 2);
  test.equal(c1.invalidated, false);
  test.equal(buf, [4, 1, 3, 9, 2, 5, 7, 10]);

  // test self-stop
  buf.length = 0;
  shouldStop = true;
  c1.invalidate();
  test.equal(buf, [6, 8]);
  await TrackerAsync.flush();
  test.equal(buf, [6, 8, 14, 11, 13, 12, 15]);

});

Tinytest.addAsync("tracker async - onInvalidate", async function (test) {
  var buf = "";

  var c1 = await TrackerAsync.autorun(function () {
    buf += "*";
  });

  var append = function (x, expectedComputation) {
    return function (givenComputation) {
      test.isFalse(TrackerAsync.active);
      test.equal(givenComputation, expectedComputation || c1);
      buf += x;
    };
  };

  c1.onStop(append('s'));

  c1.onInvalidate(append('a'));
  c1.onInvalidate(append('b'));
  test.equal(buf, '*');
  TrackerAsync.autorun(function (me) {
    TrackerAsync.onInvalidate(append('z', me));
    me.stop();
    test.equal(buf, '*z');
    c1.invalidate();
  });
  test.equal(buf, '*zab');
  c1.onInvalidate(append('c'));
  c1.onInvalidate(append('d'));
  test.equal(buf, '*zabcd');
  await TrackerAsync.flush();
  test.equal(buf, '*zabcd*');

  // afterFlush ordering
  buf = '';
  c1.onInvalidate(append('a'));
  c1.onInvalidate(append('b'));
  TrackerAsync.afterFlush(function () {
    append('x')(c1);
    c1.onInvalidate(append('c'));
    c1.invalidate();
    TrackerAsync.afterFlush(function () {
      append('y')(c1);
      c1.onInvalidate(append('d'));
      c1.invalidate();
    });
  });
  TrackerAsync.afterFlush(function () {
    append('z')(c1);
    c1.onInvalidate(append('e'));
    c1.invalidate();
  });

  test.equal(buf, '');
  await TrackerAsync.flush();
  test.equal(buf, 'xabc*ze*yd*');

  buf = "";
  c1.onInvalidate(append('m'));
  await TrackerAsync.flush();
  test.equal(buf, '');
  c1.stop();
  test.equal(buf, 'ms');  // s is from onStop
  await TrackerAsync.flush();
  test.equal(buf, 'ms');
  c1.onStop(append('S'));
  test.equal(buf, 'msS');
});

Tinytest.addAsync('tracker async - invalidate at flush time', async function (test) {
  // Test this sentence of the docs: Functions are guaranteed to be
  // called at a time when there are no invalidated computations that
  // need rerunning.

  var buf = [];

  TrackerAsync.afterFlush(function () {
    buf.push('C');
  });

  // When c1 is invalidated, it invalidates c2, then stops.
  var c1 = await TrackerAsync.autorun(function (c) {
    if (! c.firstRun) {
      buf.push('A');
      c2.invalidate();
      c.stop();
    }
  });

  var c2 = await TrackerAsync.autorun(function (c) {
    if (! c.firstRun) {
      buf.push('B');
      c.stop();
    }
  });

  // Invalidate c1.  If all goes well, the re-running of
  // c2 should happen before the afterFlush.
  c1.invalidate();
  await TrackerAsync.flush();

  test.equal(buf.join(''), 'ABC');

});

Tinytest.addAsync('tracker async - throwFirstError', async function (test) {
  var d = new TrackerAsync.Dependency;
  await TrackerAsync.autorun(function (c) {
    d.depend();
    if (!c.firstRun) {
      throw new Error("foo");
    }
  });

  d.changed();
  // doesn't throw; logs instead.
  Meteor._suppress_log(1);
  await TrackerAsync.flush();

  d.changed();
  try {
    await TrackerAsync.flush({_throwFirstError: true});
  } catch(e) {
    test.throws(e, /foo/);
  }
});

Tinytest.addAsync('tracker async - no infinite recomputation', async function (test, onComplete) {
  var reran = false;
  var c = await TrackerAsync.autorun(function (c) {
    if (! c.firstRun)
      reran = true;
    c.invalidate();
  });
  test.isFalse(reran);
  Meteor.setTimeout(function () {
    c.stop();
    TrackerAsync.afterFlush(function () {
      test.isTrue(reran);
      test.isTrue(c.stopped);
      onComplete();
    });
  }, 100);
});

Tinytest.addAsync('tracker async - await TrackerAsync.flush finishes', async function (test) {
  // Currently, _runFlush will "yield" every 1000 computations... unless run in
  // await TrackerAsync.flush. So this test validates that await TrackerAsync.flush is capable of
  // running 2000 computations. Which isn't quite the same as infinity, but it's
  // getting there.
  var n = 0;
  var c = await TrackerAsync.autorun(function (c) {
    if (++n < 2000) {
      c.invalidate();
    }
  });
  test.equal(n, 1);
  await TrackerAsync.flush();
  test.equal(n, 2000);
});

// TODO #Async Tracker fix this test. It'll probably succeed, but it's fake
testAsyncMulti('tracker async - TrackerAsync.autorun, onError option', [async function (test, expect) {
  var d = new TrackerAsync.Dependency;
  var c = await TrackerAsync.autorun(function (c) {
    d.depend();

    if (! c.firstRun)
      throw new Error("foo");
  }, {
    onError: expect(function (err) {
      test.equal(err.message, "foo");
    })
  });

  d.changed();
  await TrackerAsync.flush();
}]);

Tinytest.addAsync('computation async - #flush', async function (test) {
  var i = 0, j = 0, d = new TrackerAsync.Dependency;
  var c1 = await TrackerAsync.autorun(function () {
    d.depend();
    i = i + 1;
  });
  var c2 = await TrackerAsync.autorun(function () {
    d.depend();
    j = j + 1;
  });
  test.equal(i,1);
  test.equal(j,1);

  d.changed();
  c1.flush();
  test.equal(i, 2);
  test.equal(j, 1);

  await TrackerAsync.flush();
  test.equal(i, 2);
  test.equal(j, 2);
});

Tinytest.addAsync('computation async - #run', async function (test) {
  var i = 0, d = new TrackerAsync.Dependency, d2 = new TrackerAsync.Dependency;
  var computation = await TrackerAsync.autorun(function (c) {
    d.depend();
    i = i + 1;
    //when #run() is called, this dependency should be picked up
    if (i>=2 && i<4) { d2.depend(); }
  });
  test.equal(i,1);
  computation.run();
  test.equal(i,2);

  d.changed(); await TrackerAsync.flush();
  test.equal(i,3);

  //we expect to depend on d2 at this point
  d2.changed(); await TrackerAsync.flush();
  test.equal(i,4);

  //we no longer depend on d2, only d
  d2.changed(); await TrackerAsync.flush();
  test.equal(i,4);
  d.changed(); await TrackerAsync.flush();
  test.equal(i,5);
});
