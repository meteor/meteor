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

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

typedef NS_ENUM(NSInteger, METNetworkReachabilityStatus) {
  METNetworkReachabilityStatusUnknown = 0,
  METNetworkReachabilityStatusNotReachable,
  METNetworkReachabilityStatusReachable
};

@protocol METNetworkReachabilityManagerDelegate;

@interface METNetworkReachabilityManager : NSObject

- (instancetype)initWithHostName:(NSString *)hostName NS_DESIGNATED_INITIALIZER;
- (instancetype)init NS_UNAVAILABLE;

@property (nullable, weak, nonatomic) id<METNetworkReachabilityManagerDelegate> delegate;
@property (nullable, strong, nonatomic) dispatch_queue_t delegateQueue;

@property (assign, nonatomic) METNetworkReachabilityStatus reachabilityStatus;

- (BOOL)startMonitoring;
- (void)stopMonitoring;

@end

@protocol METNetworkReachabilityManagerDelegate <NSObject>

- (void)networkReachabilityManager:(METNetworkReachabilityManager *)reachabilityManager didDetectReachabilityStatusChange:(METNetworkReachabilityStatus)reachabilityStatus;

@end

NS_ASSUME_NONNULL_END
