import { Tinytest } from 'meteor/tinytest';
import {
  pathFromDotted,
  pathToDotted,
  isNumericSegment,
} from '../query/paths';

Tinytest.add('afs - query - paths - pathFromDotted basic', (test) => {
  test.equal(pathFromDotted('a'), ['a']);
  test.equal(pathFromDotted('a.b.c'), ['a', 'b', 'c']);
  test.equal(pathFromDotted('items.0.name'), ['items', '0', 'name']);
});

Tinytest.add('afs - query - paths - pathFromDotted empty input', (test) => {
  test.equal(pathFromDotted(''), []);
});

Tinytest.add('afs - query - paths - pathFromDotted rejects non-string', (test) => {
  test.throws(() => pathFromDotted(null), /string/);
  test.throws(() => pathFromDotted(undefined), /string/);
  test.throws(() => pathFromDotted(['a', 'b']), /string/);
});

Tinytest.add('afs - query - paths - pathToDotted basic', (test) => {
  test.equal(pathToDotted(['a']), 'a');
  test.equal(pathToDotted(['a', 'b', 'c']), 'a.b.c');
  test.equal(pathToDotted(['items', '0', 'name']), 'items.0.name');
});

Tinytest.add('afs - query - paths - pathToDotted empty array', (test) => {
  test.equal(pathToDotted([]), '');
});

Tinytest.add('afs - query - paths - pathToDotted rejects non-array', (test) => {
  test.throws(() => pathToDotted('a.b'), /array/);
});

Tinytest.add('afs - query - paths - isNumericSegment', (test) => {
  test.isTrue(isNumericSegment('0'));
  test.isTrue(isNumericSegment('42'));
  test.isFalse(isNumericSegment(''));
  test.isFalse(isNumericSegment('a'));
  test.isFalse(isNumericSegment('1a'));
  test.isFalse(isNumericSegment('-1'));   // Mongo segments are unsigned
  test.isFalse(isNumericSegment('1.0'));
});

Tinytest.add('afs - query - paths - round trip identity', (test) => {
  const cases = ['a', 'a.b', 'a.b.c', 'items.0.name', 'x'];
  for (const dotted of cases) {
    test.equal(pathToDotted(pathFromDotted(dotted)), dotted);
  }
});
