import { Tinytest } from "meteor/tinytest";

Tinytest.add("TypeScript - basics", test => {
  test.equal(2 + 2, 4);
});

Tinytest.add("TypeScript - const enum", test => {
  const enum Kind {
    NORMAL,
    WEIRD,
  }
  test.equal(typeof Kind.NORMAL, "number");
  test.equal(typeof Kind.WEIRD, "number");
  test.equal(Kind.NORMAL + 1, Kind.WEIRD);
});

Tinytest.add("TypeScript - constructor member parameters", test => {
  class Test {
    constructor(
      private a: number,
      public b: string,
    ) {}
  }
  const t = new Test(1234, "asdf");
  test.equal((t as any).a, 1234);
  test.equal(t.b, "asdf");
});

Tinytest.add("TypeScript - namespaces", test => {
  function foo() {
    return foo.bar;
  }

  namespace foo {
    export const bar = "oyez";
  }

  test.equal(foo(), "oyez");
});
