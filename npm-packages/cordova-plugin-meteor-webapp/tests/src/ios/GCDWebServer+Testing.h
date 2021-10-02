#import "GCDWebServer.h"

@protocol GCDWebServerTestingDelegate<GCDWebServerDelegate>
  - (void)webServer:(GCDWebServer *)server didReceiveRequest:(GCDWebServerRequest *)request;
@end

@interface GCDWebServer (Testing)

@end
