export class Test {
  constructor({
    left,
    right,
    ...rest
  }) {
    Object.assign(this, { left, right, rest });
  }
}
