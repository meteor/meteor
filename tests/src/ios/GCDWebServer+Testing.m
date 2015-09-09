#import "GCDWebServer+Testing.h"
#import "GCDWebServerPrivate.h"
#import <objc/runtime.h>

@implementation GCDWebServer (Testing)

+ (void)load {
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    Class class = [self class];

    SEL originalSelector = @selector(addHandlerWithMatchBlock:asyncProcessBlock:);
    SEL swizzledSelector = @selector(testing_addHandlerWithMatchBlock:asyncProcessBlock:);

    Method originalMethod = class_getInstanceMethod(class, originalSelector);
    Method swizzledMethod = class_getInstanceMethod(class, swizzledSelector);

    method_exchangeImplementations(originalMethod, swizzledMethod);
  });
}

- (void)testing_addHandlerWithMatchBlock:(GCDWebServerMatchBlock)matchBlock asyncProcessBlock:(GCDWebServerAsyncProcessBlock)processBlock {
    __weak __typeof__(self) weakSelf = self;
  [self testing_addHandlerWithMatchBlock:matchBlock asyncProcessBlock:^(GCDWebServerRequest *request, GCDWebServerCompletionBlock completionBlock) {
    __strong __typeof(weakSelf) strongSelf = weakSelf;
    id<GCDWebServerDelegate> delegate = strongSelf.delegate;
    if ([delegate respondsToSelector:@selector(webServer:didReceiveRequest:)]) {
      dispatch_async(dispatch_get_main_queue(), ^{
        [((id<GCDWebServerTestingDelegate>)delegate) webServer:strongSelf didReceiveRequest:request];
      });
    }

    processBlock(request, completionBlock);
  }];
}

@end
