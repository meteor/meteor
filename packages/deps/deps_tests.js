Tinytest.add('deps - autorun', function (test) {
  var v = new Deps.Variable;
  var x = 0;
  var handle = Deps.autorun(function (handle) {
    Deps.depend(v);
    ++x;
  });
  test.equal(x, 1);
  Deps.flush();
  test.equal(x, 1);
  v.changed();
  test.equal(x, 1);
  Deps.flush();
  test.equal(x, 2);
  v.changed();
  test.equal(x, 2);
  Deps.flush();
  test.equal(x, 3);
  v.changed();
  // Prevent the function from running further.
  handle.stop();
  Deps.flush();
  test.equal(x, 3);
  v.changed();
  Deps.flush();
  test.equal(x, 3);

  Deps.autorun(function (internalHandle) {
    Deps.depend(v);
    ++x;
    if (x == 6)
      internalHandle.stop();
  });
  test.equal(x, 4);
  v.changed();
  Deps.flush();
  test.equal(x, 5);
  v.changed();
  // Increment to 6 and stop.
  Deps.flush();
  test.equal(x, 6);
  v.changed();
  Deps.flush();
  // Still 6!
  test.equal(x, 6);
});

Tinytest.add("deps - nested autorun", function (test) {
  var a = new Deps.Variable;
  var b = new Deps.Variable;
  var c = new Deps.Variable;
  var d = new Deps.Variable;
  var e = new Deps.Variable;
  var f = new Deps.Variable;

  var buf = "";

  var c1 = new Deps.Computation;
  c1.run(function () {
    Deps.depend(a);
    buf += 'a';
    Deps.autorun(function () {
      Deps.depend(b);
      buf += 'b';
      Deps.autorun(function () {
        Deps.depend(c);
        buf += 'c';
        var c2 = new Deps.Computation;
        c2.run(function () {
          Deps.depend(d);
          buf += 'd';
          Deps.autorun(function () {
            Deps.depend(e);
            buf += 'e';
            Deps.autorun(function () {
              Deps.depend(f);
              buf += 'f';
            });
          });
        });
        Deps.currentComputation.onInvalidate(function () {
          c2.invalidate();
        });
      });
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

  // more autoruns
  changeAndExpect(e, 'ef');
  changeAndExpect(f, 'f');
  // invalidate inner context
  changeAndExpect(d, '');
  // no more autorunning!
  changeAndExpect(e, '');
  changeAndExpect(f, '');
  // re-autorun C
  changeAndExpect(c, 'cdef');
  changeAndExpect(e, 'ef');
  changeAndExpect(f, 'f');
  // re-autorun B
  changeAndExpect(b, 'bcdef');
  changeAndExpect(e, 'ef');
  changeAndExpect(f, 'f');
  // kill A
  a.changed();
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
