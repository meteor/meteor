import { Tinytest } from 'meteor/tinytest';
import { CBOR } from 'meteor/harry97:cbor';

// EJSON is optional - only for comparison tests
let EJSON;
try {
  EJSON = Package['ejson'] && Package['ejson'].EJSON;
} catch (e) {
  // EJSON not available in core package tests
}

// Basic CBOR functionality tests
Tinytest.add('CBOR - Basic encoding/decoding', function (test) {
  const testValues = [
    null,
    true,
    false,
    42,
    -17,
    3.14159,
    "hello world",
    [1, 2, 3],
    { name: "test", value: 123 },
    new Date('2023-01-01T00:00:00Z')
  ];

  testValues.forEach((value, index) => {
    const encoded = CBOR.encode(value);
    const decoded = CBOR.decode(encoded);
    
    if (value instanceof Date) {
      test.equal(decoded.getTime(), value.getTime(), `Date test ${index} failed`);
    } else {
      test.equal(decoded, value, `Basic test ${index} failed`);
    }
  });
});

// Binary data efficiency test
Tinytest.add('CBOR - Binary data efficiency', function (test) {
  const binaryData = new Uint8Array(1000);
  for (let i = 0; i < 1000; i++) {
    binaryData[i] = i % 256;
  }

  const testObject = {
    data: binaryData,
    metadata: {
      name: "test.bin",
      size: 1000
    }
  };

  // CBOR encoding
  const cborEncoded = CBOR.encode(testObject);
  const cborDecoded = CBOR.decode(cborEncoded);
  
  test.equal(cborDecoded.metadata.name, "test.bin");
  test.equal(cborDecoded.metadata.size, 1000);
  test.equal(cborDecoded.data.length, 1000);
  
  // Compare with EJSON (should be much larger due to base64)
  if (EJSON) {
    const ejsonString = EJSON.stringify(testObject);
    const cborString = CBOR.stringify(testObject);

    console.log(`EJSON size: ${ejsonString.length}, CBOR size: ${cborString.length}`);
    test.isTrue(cborString.length < ejsonString.length, "CBOR should be more efficient than EJSON for binary data");
  }
});

// File object test (browser only)
if (typeof File !== 'undefined') {
  Tinytest.addAsync('CBOR - File object encoding', function (test, done) {
    const fileContent = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const file = new File([fileContent], "test.txt", { type: "text/plain" });
    
    CBOR.encodeAsync(file).then(encoded => {
      const decoded = CBOR.decode(encoded);
      
      test.equal(decoded.name, "test.txt");
      test.equal(decoded.type, "text/plain");
      test.equal(decoded.size, 5);
      
      if (typeof File !== 'undefined') {
        test.isTrue(decoded instanceof File, "Should reconstruct File object in browser");
      } else {
        test.isTrue(decoded._isFileProxy, "Should create File proxy on server");
      }
      
      done();
    }).catch(error => {
      test.fail(`File encoding failed: ${error.message}`);
      done();
    });
  });
}

// Buffer object test (server only)
if (typeof Buffer !== 'undefined') {
  Tinytest.add('CBOR - Buffer object encoding', function (test) {
    const buffer = Buffer.from("Hello World", "utf8");
    
    const encoded = CBOR.encode(buffer);
    const decoded = CBOR.decode(encoded);
    
    if (typeof Buffer !== 'undefined') {
      test.isTrue(Buffer.isBuffer(decoded), "Should reconstruct Buffer object");
      test.equal(decoded.toString('utf8'), "Hello World");
    } else {
      test.isTrue(decoded instanceof Uint8Array, "Should return Uint8Array in browser");
    }
  });
}

// EJSON compatibility test
Tinytest.add('CBOR - EJSON compatibility', function (test) {
  const ejsonObject = {
    date: { $date: 1672531200000 },
    binary: { $binary: "SGVsbG8gV29ybGQ=" }, // "Hello World" in base64
    custom: { $type: "Color", $value: { r: 255, g: 0, b: 0 } }
  };
  
  const converted = CBOR.fromEJSON(ejsonObject);
  const backToEJSON = CBOR.toEJSON(converted);
  
  test.isTrue(converted.date instanceof Date, "Should convert EJSON date to Date object");
  test.isTrue(converted.binary instanceof Uint8Array, "Should convert EJSON binary to Uint8Array");
  
  test.equal(backToEJSON.date.$date, 1672531200000, "Should convert back to EJSON date format");
});

// Performance comparison test
Tinytest.add('CBOR - Performance analysis', function (test) {
  const testData = {
    numbers: Array.from({length: 100}, (_, i) => i),
    strings: Array.from({length: 50}, (_, i) => `string_${i}`),
    binary: new Uint8Array(500),
    nested: {
      level1: {
        level2: {
          data: "deep nesting test"
        }
      }
    }
  };
  
  const analysis = CBOR.analyze(testData);
  
  test.isTrue(typeof analysis.cborSize === 'number', "Should return CBOR size");
  test.isTrue(typeof analysis.jsonSize === 'number', "Should return JSON size");
  test.isTrue(typeof analysis.compressionRatio === 'number', "Should return compression ratio");
  
  console.log('CBOR Analysis:', analysis);
  
  // CBOR should be more efficient for this mixed data
  test.isTrue(analysis.compressionRatio > 1, "CBOR should be more compact than JSON");
});

// Edge cases test
Tinytest.add('CBOR - Edge cases', function (test) {
  const edgeCases = [
    undefined,
    NaN,
    Infinity,
    -Infinity,
    "",
    [],
    {},
    new Uint8Array(0), // empty binary
    new Date(0), // epoch
  ];
  
  edgeCases.forEach((value, index) => {
    try {
      const encoded = CBOR.encode(value);
      const decoded = CBOR.decode(encoded);
      
      if (Number.isNaN(value)) {
        test.isTrue(Number.isNaN(decoded), `NaN test failed`);
      } else if (value instanceof Date) {
        test.equal(decoded.getTime(), value.getTime(), `Date edge case ${index} failed`);
      } else {
        test.equal(decoded, value, `Edge case ${index} failed`);
      }
    } catch (error) {
      test.fail(`Edge case ${index} threw error: ${error.message}`);
    }
  });
});

// Clone functionality test
Tinytest.add('CBOR - Clone functionality', function (test) {
  const original = {
    date: new Date(),
    binary: new Uint8Array([1, 2, 3, 4, 5]),
    nested: {
      array: [1, 2, 3],
      object: { key: "value" }
    }
  };
  
  const cloned = CBOR.clone(original);

  // Should be deep equal by value
  test.equal(cloned.nested.object.key, original.nested.object.key, "Deep properties should be equal");
  test.isTrue(CBOR.equals(cloned, original), "Clone should be equal by value");

  // Modify clone shouldn't affect original (tests that it's a deep clone, not a reference)
  cloned.nested.object.key = "modified";
  test.equal(original.nested.object.key, "value", "Original should not be modified");
  test.notEqual(cloned, original, "Modified clone should be different from original");
});

// EJSON API Compatibility tests
Tinytest.add('CBOR - EJSON API compatibility', function (test) {
  // Test addType
  class Color {
    constructor(r, g, b) {
      this.r = r;
      this.g = g;
      this.b = b;
    }
    
    typeName() {
      return 'Color';
    }
    
    toJSONValue() {
      return { r: this.r, g: this.g, b: this.b };
    }
    
    equals(other) {
      return other instanceof Color &&
        this.r === other.r &&
        this.g === other.g &&
        this.b === other.b;
    }
    
    clone() {
      return new Color(this.r, this.g, this.b);
    }
  }
  
  CBOR.addType('Color', (value) => new Color(value.r, value.g, value.b));
  
  const red = new Color(255, 0, 0);
  const serialized = CBOR.stringify(red);
  const deserialized = CBOR.parse(serialized);
  
  test.isTrue(deserialized instanceof Color, "Should reconstruct Color object");
  test.equal(deserialized.r, 255, "Red component should be preserved");
  test.equal(deserialized.g, 0, "Green component should be preserved");
  test.equal(deserialized.b, 0, "Blue component should be preserved");
  
  // Test isBinary
  const binaryData = new Uint8Array([1, 2, 3]);
  test.isTrue(CBOR.isBinary(binaryData), "Should detect Uint8Array as binary");
  test.isFalse(CBOR.isBinary("string"), "Should not detect string as binary");
  test.isFalse(CBOR.isBinary({}), "Should not detect object as binary");
  
  // Test newBinary
  const newBuffer = CBOR.newBinary(10);
  test.equal(newBuffer.length, 10, "Should create buffer of correct size");
  test.isTrue(CBOR.isBinary(newBuffer), "Created buffer should be detected as binary");
  
  // Test toJSONValue/fromJSONValue
  const complexObject = {
    date: new Date('2023-01-01'),
    binary: new Uint8Array([1, 2, 3]),
    color: red,
    nested: {
      array: [1, 2, 3]
    }
  };
  
  const jsonValue = CBOR.toJSONValue(complexObject);
  test.isTrue(jsonValue.date && jsonValue.date.$date, "Date should be converted to EJSON format");
  test.isTrue(jsonValue.binary && jsonValue.binary.$binary, "Binary should be converted to EJSON format");
  test.equal(jsonValue.color.$type, "Color", "Custom type should be converted to EJSON format");
  
  const reconstructed = CBOR.fromJSONValue(jsonValue);
  test.isTrue(reconstructed.date instanceof Date, "Date should be reconstructed");
  test.isTrue(CBOR.isBinary(reconstructed.binary), "Binary should be reconstructed");
  test.isTrue(reconstructed.color instanceof Color, "Custom type should be reconstructed");
});

// Drop-in replacement test
Tinytest.add('CBOR - Drop-in replacement for EJSON', function (test) {
  // This test verifies that CBOR can replace EJSON in existing code
  
  // Simulate typical EJSON usage patterns
  const testData = {
    date: new Date(),
    binary: new Uint8Array([1, 2, 3, 4, 5]),
    number: 42,
    string: "hello",
    array: [1, 2, 3],
    object: { key: "value" }
  };
  
  // These should work identically to EJSON
  const stringified = CBOR.stringify(testData);
  const parsed = CBOR.parse(stringified);
  
  test.isTrue(parsed.date instanceof Date, "Date should be preserved");
  test.equal(parsed.date.getTime(), testData.date.getTime(), "Date value should be preserved");
  test.isTrue(CBOR.isBinary(parsed.binary), "Binary should be preserved");
  test.equal(parsed.binary.length, 5, "Binary length should be preserved");
  test.equal(parsed.number, 42, "Number should be preserved");
  test.equal(parsed.string, "hello", "String should be preserved");
  test.equal(parsed.array.length, 3, "Array should be preserved");
  test.equal(parsed.object.key, "value", "Object should be preserved");
  
  // Clone should work identically
  const cloned = CBOR.clone(testData);
  test.equal(cloned.object.key, testData.object.key, "Clone content should be equal");

  // Equals should work identically
  test.isTrue(CBOR.equals(testData, cloned), "Original and clone should be equal");

  // After modification, they should no longer be equal
  cloned.number = 99;
  test.isFalse(CBOR.equals(testData, cloned), "Modified clone should not be equal");
  test.notEqual(cloned, testData, "Modified clone should be different object");
});
