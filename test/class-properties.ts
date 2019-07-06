const enum TestResult { PASS, FAIL }

export class Test {
  public property: number = 1234;
  public result = TestResult.PASS;
  constructor(public value: string) {}
}
