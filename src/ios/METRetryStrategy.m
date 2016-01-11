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

#import "METRetryStrategy.h"

#import "METRandomValueGenerator.h"

@implementation METRetryStrategy

- (instancetype)init {
  self = [super init];
  if (self) {
    _maximumTimeInterval = DBL_MAX;
  }
  return self;
}

- (NSTimeInterval)retryIntervalForNumberOfAttempts:(NSUInteger)numberOfAttempts {
  if (numberOfAttempts < _numberOfAttemptsAtMinimumTimeInterval) {
    return _minimumTimeInterval;
  } else {
    NSTimeInterval timeInterval = fmin(_maximumTimeInterval, _baseTimeInterval * pow(_exponent, numberOfAttempts));
    if (_randomizationFactor > 0) {
      // 1 + Math.random() * this.randomisationFactor_
      timeInterval *= ([[METRandomValueGenerator defaultRandomValueGenerator] randomFraction] * _randomizationFactor) + (1 - _randomizationFactor / 2);
    }
    return timeInterval;
  }
}

@end
