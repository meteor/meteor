Tinytest.add('deps - run', function (test) {
  var d = new Deps.Variable;
  var x = 0;
  var handle = Deps.run(function (handle) {
    Deps.depend(d);
    ++x;
  });
  test.equal(x, 1);
  Deps.flush();
  test.equal(x, 1);
  d.change();
  test.equal(x, 1);
  Deps.flush();
  test.equal(x, 2);
  d.change();
  test.equal(x, 2);
  Deps.flush();
  test.equal(x, 3);
  d.change();
  // Prevent the function from running further.
  handle.stop();
  Deps.flush();
  test.equal(x, 3);
  d.change();
  Deps.flush();
  test.equal(x, 3);

  Deps.run(function (internalHandle) {
    d.depend();
    ++x;
    if (x == 6)
      internalHandle.stop();
  });
  test.equal(x, 4);
  d.change();
  Deps.flush();
  test.equal(x, 5);
  d.change();
  // Increment to 6 and stop.
  Deps.flush();
  test.equal(x, 6);
  d.change();
  Deps.flush();
  // Still 6!
  test.equal(x, 6);
});

Tinytest.add("deps - nested run", function (test) {
  var a = new Deps.Variable;
  var b = new Deps.Variable;
  var c = new Deps.Variable;
  var d = new Deps.Variable;
  var e = new Deps.Variable;
  var f = new Deps.Variable;

  var buf = "";

  var c1 = new Deps.Computation(function () {
    a.depend();
    buf += 'a';
    Deps.run(function () {
      b.depend();
      buf += 'b';
      Deps.run(function () {
        c.depend();
        buf += 'c';
        var c2 = new Deps.Computation(function () {
          d.depend();
          buf += 'd';
          Deps.run(function () {
            e.depend();
            buf += 'e';
            Deps.run(function () {
              f.depend();
              buf += 'f';
            });
          });
          Deps.onInvalidate(function () {
            // only run once
            c2.stop();
          });
        });
        Deps.onInvalidate(function () {
          // link to parent explicitly
          c2.stop();
        });
      });
    });
  });
  c1.onInvalidate(function () {
    c1.stop();
  });

  var expect = function (str) {
    test.equal(buf, str);
    buf = "";
  };

  expect('abcdef');

  b.change();
  expect(''); // didn't flush yet
  Deps.flush();
  expect('bcdef');

  c.change();
  Deps.flush();
  expect('cdef');

  var changeAndExpect = function (v, str) {
    v.change();
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
  a.change();
  // This flush would be unnecessary if outstanding callbacks
  // were processed in the containment order of their contexts
  // (i.e. parents before children)
  Deps.flush();
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
