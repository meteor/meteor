Tinytest.add("js-analyze - basic", function (test) {

  var R = JSAnalyze.READ;
  var W = JSAnalyze.WRITE;
  var run = function (source) {
    return JSAnalyze.findGlobalDottedRefs(source);
  };

  test.equal(run('x'), {x: R});
  test.equal(run('x + y'), {x: R, y: R});
  test.equal(run('x = y'), {x: W, y: R});
  test.equal(run('var x; x = y'), {y: R});
  test.equal(run('var y; x = y'), {x: W});
  test.equal(run('var x,y; x = y'), {});
  test.equal(run('for (x in y);'), {x: W, y: R});
  test.equal(run('for (var x in y);'), {y: R});
  test.equal(run('x++'), {x: W});
  test.equal(run('var x = y'), {y: R});
  test.equal(run('a.b[c.d]'), {'a.b': R, 'c.d': R});
  test.equal(run('foo.bar[baz][c.d].z = 3'), {'foo.bar': W, baz: R, 'c.d': R});
  test.equal(run('foo.bar(baz)[c.d].z = 3'), {'foo.bar': R, baz: R, 'c.d': R});
  test.equal(run('var x = y.z; x.a = y; z.b;'), {'y.z': R, 'z.b': R, 'y': R});
  test.equal(run('Foo.Bar'), {'Foo.Bar': R});
  test.equal(run('Foo.Bar = 3'), {'Foo.Bar': W});
  test.equal(run(
    '(function (a, d) { var b = a, c; return f(a.z, b.z, c.z, d.z, e.z); })()'),
             { 'f': R, 'e.z': R });
  test.equal(run('try { Foo } catch (e) { e }'), {'Foo': R});
  test.equal(run('try { Foo } catch (e) { Foo }'), {'Foo': R});
  test.equal(run('try { Foo } catch (Foo) { Foo }'), {'Foo': R});
  test.equal(run('try { e } catch (Foo) { Foo }'), {'e': R});
  test.equal(run('var x = function y () { return String(y); }'), {'String': R});
  test.equal(run('a[b=c] = d'), {a: W, b: W, c: R, d: R});
  test.equal(run('a.a.a[b.b.b=c.c.c] = d.d.d'),
             {'a.a.a': W, 'b.b.b': W, 'c.c.c': R, 'd.d.d': R});
});
