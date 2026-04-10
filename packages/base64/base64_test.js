import { Base64 } from "./base64.js";

const asciiToArray = (str) => {
  const arr = Base64.newBinary(str.length);
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c > 0xff) {
      throw new Error("Not ascii");
    }

    arr[i] = c;
  }

  return arr;
};

const arrayToAscii = (arr) =>
  arr.reduce((prev, charCode) => prev.push(String.fromCharCode(charCode)) && prev, []).join("");

Tinytest.add("base64 - testing the test", (test) => {
  test.equal(
    arrayToAscii(asciiToArray("The quick brown fox jumps over the lazy dog")),
    "The quick brown fox jumps over the lazy dog",
  );
});

Tinytest.add("base64 - empty", (test) => {
  test.equal(Base64.encode(EJSON.newBinary(0)), "");
  test.equal(Base64.decode(""), EJSON.newBinary(0));
});

Tinytest.add("base64 - wikipedia examples", (test) => {
  const tests = [
    { txt: "pleasure.", res: "cGxlYXN1cmUu" },
    { txt: "leasure.", res: "bGVhc3VyZS4=" },
    { txt: "easure.", res: "ZWFzdXJlLg==" },
    { txt: "asure.", res: "YXN1cmUu" },
    { txt: "sure.", res: "c3VyZS4=" },
  ];
  tests.forEach((t) => {
    test.equal(Base64.encode(asciiToArray(t.txt)), t.res);
    test.equal(arrayToAscii(Base64.decode(t.res)), t.txt);
  });
});

Tinytest.add("base64 - non-text examples", (test) => {
  const tests = [
    { array: [0, 0, 0], b64: "AAAA" },
    { array: [0, 0, 1], b64: "AAAB" },
  ];
  tests.forEach((t) => {
    test.equal(Base64.encode(t.array), t.b64);
    const expectedAsBinary = EJSON.newBinary(t.array.length);
    t.array.forEach((val, i) => (expectedAsBinary[i] = val));
    test.equal(Base64.decode(t.b64), expectedAsBinary);
  });
});

Tinytest.add("base64 - RFC 4648 test vectors", (test) => {
  const vectors = [
    { txt: "", res: "" },
    { txt: "f", res: "Zg==" },
    { txt: "fo", res: "Zm8=" },
    { txt: "foo", res: "Zm9v" },
    { txt: "foob", res: "Zm9vYg==" },
    { txt: "fooba", res: "Zm9vYmE=" },
    { txt: "foobar", res: "Zm9vYmFy" },
  ];
  vectors.forEach((v) => {
    test.equal(Base64.encode(asciiToArray(v.txt)), v.res);
    test.equal(arrayToAscii(Base64.decode(v.res)), v.txt);
  });
});

Tinytest.add("base64 - round-trip for all byte values 0-255", (test) => {
  const original = Base64.newBinary(256);
  for (let i = 0; i < 256; i++) {
    original[i] = i;
  }

  const decoded = Base64.decode(Base64.encode(original));
  test.equal(decoded.length, 256);
  for (let i = 0; i < 256; i++) {
    test.equal(decoded[i], i, `byte at index ${i} should round-trip`);
  }
});

Tinytest.add("base64 - round-trip for various lengths", (test) => {
  const lengths = [0, 1, 2, 3, 4, 5, 6, 7, 8, 15, 16, 17, 31, 32, 33];
  lengths.forEach((n) => {
    const original = Base64.newBinary(n);
    for (let i = 0; i < n; i++) {
      original[i] = i % 256;
    }

    const decoded = Base64.decode(Base64.encode(original));
    test.equal(decoded.length, n, `length ${n} should round-trip`);
    for (let i = 0; i < n; i++) {
      test.equal(decoded[i], i % 256, `byte at index ${i} (length ${n})`);
    }
  });
});

Tinytest.add("base64 - encoded output length is ceil(n/3)*4", (test) => {
  const sizes = [0, 1, 2, 3, 4, 5, 10, 100, 999, 1000];
  sizes.forEach((n) => {
    const arr = Base64.newBinary(n);
    for (let i = 0; i < n; i++) {
      arr[i] = i % 256;
    }

    const expected = Math.ceil(n / 3) * 4;
    test.equal(
      Base64.encode(arr).length,
      expected,
      `encode(length=${n}) should be ${expected} chars`,
    );
  });
});

Tinytest.add("base64 - padding characters are correct", (test) => {
  // 1 byte -> "==" padding
  const oneByte = Base64.encode([0x41]);
  test.equal(oneByte.length, 4);
  test.equal(oneByte.slice(-2), "==", "1-byte input should end with ==");
  test.isFalse(oneByte.slice(-3) === "===", "should not end with ===");

  // 2 bytes -> "=" padding (single)
  const twoBytes = Base64.encode([0x41, 0x42]);
  test.equal(twoBytes.length, 4);
  test.equal(twoBytes.slice(-1), "=", "2-byte input should end with single =");
  test.isFalse(twoBytes.slice(-2) === "==", "2-byte input should not end with ==");

  // 3 bytes -> no padding
  const threeBytes = Base64.encode([0x41, 0x42, 0x43]);
  test.equal(threeBytes.length, 4);
  test.equal(threeBytes.indexOf("="), -1, "3-byte input should contain no =");
});

Tinytest.add("base64 - large input round-trip", (test) => {
  const size = 10000;
  const original = Base64.newBinary(size);
  for (let i = 0; i < size; i++) {
    original[i] = (i * 31) % 256;
  }

  const encoded = Base64.encode(original);
  test.equal(encoded.length, Math.ceil(size / 3) * 4);

  const decoded = Base64.decode(encoded);
  test.equal(decoded.length, size);
  for (let i = 0; i < size; i++) {
    if (decoded[i] !== (i * 31) % 256) {
      test.fail({
        type: "large-input-mismatch",
        message: `byte at index ${i}: expected ${(i * 31) % 256}, got ${decoded[i]}`,
      });
      return;
    }
  }
  test.ok();
});

Tinytest.add("base64 - encode rejects characters above 0xff", (test) => {
  // \u0100 is the first code point > 0xff and must be rejected.
  test.throws(() => Base64.encode("\u0100"), /Not ascii/);
  // \uffff is well above the limit and must also be rejected.
  test.throws(() => Base64.encode("\uffff"), /Not ascii/);
  // A string containing a mix of valid and invalid chars must still throw.
  test.throws(() => Base64.encode("abc\u0100"), /Not ascii/);

  // Positive controls: the boundary is > 0xff, not > 0x7f.
  // \u00ff is the last allowed code point and must NOT throw.
  const resultFf = Base64.encode("\u00ff");
  test.equal(typeof resultFf, "string");
  test.equal(resultFf.length, 4, "single byte encodes to 4 base64 chars");
  // \u0080 (first non-7-bit-ASCII byte) must also be accepted.
  const result80 = Base64.encode("\u0080");
  test.equal(typeof result80, "string");
  test.equal(result80.length, 4);
});

// Documents the ACTUAL error-handling behavior of Base64.decode:
// the implementation only throws when "=" appears at position 0 or 1
// (mod 4) of a 4-char group. Characters outside the base64 alphabet
// (e.g. "!", "?") return undefined from the internal lookup and are
// silently treated as zero — they do NOT throw. This test pins down
// the real behavior so future refactors cannot regress it unnoticed.
Tinytest.add("base64 - decode rejects '=' in leading positions", (test) => {
  // "=" at position 0 of a group.
  test.throws(() => Base64.decode("===="), /invalid base64 string/);

  // "=" at position 1 of a group.
  test.throws(() => Base64.decode("A==="), /invalid base64 string/);

  // "=" at positions 0/1 of a *later* 4-char group.
  test.throws(() => Base64.decode("AAAA===="), /invalid base64 string/);
  test.throws(() => Base64.decode("AAAAA==="), /invalid base64 string/);
});

Tinytest.add("base64 - newBinary contract", (test) => {
  [0, 1, 100].forEach((n) => {
    test.equal(Base64.newBinary(n).length, n, `newBinary(${n}).length`);
  });

  // Zero-initialized.
  const five = Base64.newBinary(5);
  for (let i = 0; i < 5; i++) {
    test.equal(five[i], 0, `newBinary(5)[${i}] should start at 0`);
  }

  // Indexed writes are readable back.
  const three = Base64.newBinary(3);
  three[0] = 42;
  three[1] = 7;
  three[2] = 255;
  test.equal(three[0], 42);
  test.equal(three[1], 7);
  test.equal(three[2], 255);

  // Interoperates with encode/decode.
  const buf = Base64.newBinary(3);
  buf[0] = 0x41;
  buf[1] = 0x42;
  buf[2] = 0x43;
  test.equal(Base64.encode(buf), "QUJD");
  const decoded = Base64.decode("QUJD");
  test.equal(decoded.length, 3);
  test.equal(decoded[0], 0x41);
  test.equal(decoded[1], 0x42);
  test.equal(decoded[2], 0x43);
});
