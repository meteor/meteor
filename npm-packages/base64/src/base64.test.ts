import { Base64 } from './base64.js';
// @ts-ignore
import EJSON from 'ejson'; // TODO replace with 1st-party package

const asciiToArray = (str: string) => {
  const arr = Base64.newBinary(str.length);
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c > 0xff) {
      throw new Error('Not ascii');
    }

    arr[i] = c;
  }

  return arr;
};

const arrayToAscii = (arr: number[] | Uint8Array) =>
  (arr as number[])
    .reduce((prev, charCode) => {
      prev.push(String.fromCharCode(charCode));
      return prev;
    }, [] as string[])
    .join('');

describe('base64', () => {
  it('testing the test', () => {
    expect(arrayToAscii(asciiToArray('The quick brown fox jumps over the lazy dog'))).toBe(
      'The quick brown fox jumps over the lazy dog'
    );
  });

  it('empty', () => {
    expect(Base64.encode(EJSON.newBinary(0))).toBe('');
    expect(Base64.decode('')).toEqual(EJSON.newBinary(0));
  });

  it('wikipedia examples', () => {
    const tests = [
      { txt: 'pleasure.', res: 'cGxlYXN1cmUu' },
      { txt: 'leasure.', res: 'bGVhc3VyZS4=' },
      { txt: 'easure.', res: 'ZWFzdXJlLg==' },
      { txt: 'asure.', res: 'YXN1cmUu' },
      { txt: 'sure.', res: 'c3VyZS4=' },
    ];
    tests.forEach(t => {
      expect(Base64.encode(asciiToArray(t.txt))).toBe(t.res);
      expect(arrayToAscii(Base64.decode(t.res))).toBe(t.txt);
    });
  });

  it('non-text examples', () => {
    const tests = [
      { array: [0, 0, 0], b64: 'AAAA' },
      { array: [0, 0, 1], b64: 'AAAB' },
    ];
    tests.forEach(t => {
      expect(Base64.encode(t.array)).toBe(t.b64);
      const expectedAsBinary = EJSON.newBinary(t.array.length);
      t.array.forEach((val, i) => (expectedAsBinary[i] = val));
      expect(Base64.decode(t.b64)).toEqual(expectedAsBinary);
    });
  });
});
