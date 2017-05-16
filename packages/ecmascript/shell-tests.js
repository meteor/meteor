import { ECMAScript } from 'meteor/ecmascript';

Tinytest.add("ecmascript - server - compileForShell - warn on imports", (test) => {
  const compileForShell = ECMAScript.compileForShell;

  test.throws(() => { compileForShell('import x from "x"'); });
  test.throws(() => { compileForShell('import x from "x"; '); });

  // no doesNotThrow in tinytest, but an uncaught exception will fail the test
  compileForShell('import x from "x"; x;');
});
