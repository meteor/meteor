Tinytest.add("js-analyze - findGlobalDottedRefs", function (test) {

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
  // Without ignoreEval, this thinks J is global.
  test.equal(run('function x(){var J;J=3;eval("foo");}'), {eval: R});
});

Tinytest.add("js-analyze - findAssignedGlobals", function (test) {

  var run = function (source, expected) {
    test.equal(JSAnalyze.findAssignedGlobals(source), expected);
  };

  run('x', {});
  run('x + y', {});
  run('x = y', {x: true});
  run('var x; x = y', {});
  run('var y; x = y', {x: true});
  run('var x,y; x = y', {});
  run('for (x in y);', {x: true});
  run('for (var x in y);', {});
  // Update operators cause ReferenceError if the left-hand is not defined.
  run('x++', {});
  run('x += 5', {});
  run('var x = y', {});
  run('a.b[c.d]', {});
  run('foo.bar[baz][c.d].z = 3', {});
  run('foo.bar(baz)[c.d].z = 3', {});
  run('var x = y.z; x.a = y; z.b;', {});
  run('Foo.Bar', {});
  run('Foo.Bar = 3', {});
  run(
    '(function (a, d) { var b = a, c; return f(a.z, b.z, c.z, d.z, e.z); })()',
    {});
  // catch clause declares a name
  run('try { Foo } catch (e) { e = 5 }', {});
  run('try { Foo } catch (e) { Foo }', {});
  run('try { Foo } catch (Foo) { Foo }', {});
  run('try { e } catch (Foo) { Foo }', {});
  run('var x = function y () { return String(y); }', {});
  run('a[b=c] = d', {b: true});
  run('a.a.a[b.b.b=c.c.c] = d.d.d', {});
  // esprima ignores parentheses
  run('((((x)))) = 5', {x: true});
  // esprima ignores comments
  run('x /* foo */ = 5', {x: true});

  // Without ignoreEval, this thinks J is global.
  run('function x(){var J;J=3;eval("foo");}', {});

  test.throws(function (){JSAnalyze.findAssignedGlobals("x = ");},
              function (e) { return e.$ParseError; });
});

