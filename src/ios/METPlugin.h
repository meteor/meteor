#import <Cordova/CDVPlugin.h>

@interface CDVPlugin ()

 - (instancetype)initWithWebViewEngine:(id <CDVWebViewEngineProtocol>)theWebViewEngine NS_DESIGNATED_INITIALIZER;

@end

@interface METPlugin : CDVPlugin

@end
