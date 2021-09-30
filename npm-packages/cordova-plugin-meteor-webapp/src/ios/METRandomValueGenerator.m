// Copyright (c) 2014-2015 Martijn Walraven
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// 
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
// 
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

#import "METRandomValueGenerator.h"

@implementation METRandomValueGenerator

+ (METRandomValueGenerator *)defaultRandomValueGenerator {
  static METRandomValueGenerator *defaultRandomValueGenerator;
  static dispatch_once_t onceToken;
  
  dispatch_once(&onceToken, ^{
    defaultRandomValueGenerator = [[self alloc] init];
  });
  
  return defaultRandomValueGenerator;
}

- (instancetype)init {
  self = [super init];
  if (self) {
    // rand48 functions require an initial value to be seeded
    srand48(time(0));
  }
  return self;
}

- (double)randomFraction {
  return drand48();
}

- (NSUInteger)randomUnsignedInteger {
  return arc4random();
}

- (NSUInteger)randomIntegerLessThanInteger:(NSUInteger)upperBound {
  return arc4random_uniform((u_int32_t)upperBound);
}

- (NSString *)randomStringWithCharactersFromString:(NSString *)characters length:(NSUInteger)length {
  NSMutableString *string = [NSMutableString stringWithCapacity:length];
  for (NSUInteger i = 0; i < length; i++) {
    NSUInteger index = [self randomIntegerLessThanInteger:[characters length]];
    unichar character = [characters characterAtIndex:index];
    [string appendFormat:@"%c", character];
  }
  return [string copy];
}

- (NSString *)randomHexStringWithLength:(NSUInteger)length {
  return [self randomStringWithCharactersFromString:@"0123456789abcdef" length:length];
}

- (NSString *)randomSeed {
  return [self randomHexStringWithLength:20];
}

- (NSString *)randomIdentifier {
  return [self randomStringWithCharactersFromString:@"23456789ABCDEFGHJKLMNPQRSTWXYZabcdefghijkmnopqrstuvwxyz" length:17];
}

@end
