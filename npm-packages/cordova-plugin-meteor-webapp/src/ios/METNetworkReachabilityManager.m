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

#import "METNetworkReachabilityManager.h"

@import SystemConfiguration;

@interface METNetworkReachabilityManager ()

- (void)didReceiveCallbackWithFlags:(SCNetworkReachabilityFlags)flags;

@end

static void METNetworkReachabilityCallback(SCNetworkReachabilityRef target, SCNetworkReachabilityFlags flags, void* info) {
  METNetworkReachabilityManager *reachabilityManager = (__bridge METNetworkReachabilityManager *)info;
  [reachabilityManager didReceiveCallbackWithFlags:flags];
}

@implementation METNetworkReachabilityManager {
  SCNetworkReachabilityRef _reachabilityRef;
}

#pragma mark - Lifecycle

- (instancetype)initWithHostName:(NSString *)hostName {
  self = [super init];
  if (self) {
    _reachabilityRef = SCNetworkReachabilityCreateWithName(NULL, [hostName UTF8String]);
    if (_reachabilityRef == NULL) {
      self = nil;
    }
  }
  return self;
}

- (void)dealloc {
  [self stopMonitoring];
  if (_reachabilityRef != NULL) {
    CFRelease(_reachabilityRef);
  }
}

#pragma mark - Monitoring Reachability State

- (BOOL)startMonitoring {
  NSAssert(_delegateQueue != nil, @"Delegate queue should be set before calling startMonitoring");
  
  SCNetworkReachabilityContext context = {0, (__bridge void *)(self), NULL, NULL, NULL};
  
  if (SCNetworkReachabilitySetCallback(_reachabilityRef, METNetworkReachabilityCallback, &context)) {
    return SCNetworkReachabilitySetDispatchQueue(_reachabilityRef, _delegateQueue);
  }
  
  return NO;
}

- (void)stopMonitoring {
  if (_reachabilityRef != NULL) {
    SCNetworkReachabilitySetDispatchQueue(_reachabilityRef, NULL);
  }
}

- (void)didReceiveCallbackWithFlags:(SCNetworkReachabilityFlags)flags {
  BOOL isReachable = ((flags & kSCNetworkReachabilityFlagsReachable) != 0);
  BOOL needsConnection = ((flags & kSCNetworkReachabilityFlagsConnectionRequired) != 0);
  BOOL canConnectAutomatically = (((flags & kSCNetworkReachabilityFlagsConnectionOnDemand ) != 0) || ((flags & kSCNetworkReachabilityFlagsConnectionOnTraffic) != 0));
  BOOL canConnectWithoutUserInteraction = (canConnectAutomatically && (flags & kSCNetworkReachabilityFlagsInterventionRequired) == 0);
  BOOL isNetworkReachable = (isReachable && (!needsConnection || canConnectWithoutUserInteraction));
  
  if (isNetworkReachable) {
    self.reachabilityStatus = METNetworkReachabilityStatusReachable;
  } else {
    self.reachabilityStatus = METNetworkReachabilityStatusNotReachable;
  }
  
  [_delegate networkReachabilityManager:self didDetectReachabilityStatusChange:_reachabilityStatus];
}

@end
