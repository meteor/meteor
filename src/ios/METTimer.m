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

#import "METTimer.h"

@implementation METTimer {
  dispatch_queue_t _queue;
  void (^_block)();
  
  dispatch_source_t _timer_source;
  BOOL _started;
}

- (instancetype)initWithQueue:(dispatch_queue_t)queue block:(void (^)())block {
  self = [super init];
  if (self) {
    _queue = queue;
    _block = [block copy];
    _tolerance = 0.1;
    _timer_source = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0, _queue);
    dispatch_source_set_event_handler(_timer_source, ^{
      if (_started) {
        dispatch_suspend(_timer_source);
        _started = NO;
      }
      _block();
    });
  }
  return self;
}

- (void)startWithTimeInterval:(NSTimeInterval)timeInterval {
  dispatch_source_set_timer(_timer_source, dispatch_time(DISPATCH_TIME_NOW, timeInterval * NSEC_PER_SEC), 0, _tolerance * NSEC_PER_MSEC);
  if (!_started) {
    dispatch_resume(_timer_source);
    _started = YES;
  }
}

- (void)stop {
  if (_started) {
    dispatch_suspend(_timer_source);
    _started = NO;
  }
}

@end
