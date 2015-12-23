/*
 Copyright (c) 2012-2015, Pierre-Olivier Latour
 All rights reserved.
 
 Redistribution and use in source and binary forms, with or without
 modification, are permitted provided that the following conditions are met:
 * Redistributions of source code must retain the above copyright
 notice, this list of conditions and the following disclaimer.
 * Redistributions in binary form must reproduce the above copyright
 notice, this list of conditions and the following disclaimer in the
 documentation and/or other materials provided with the distribution.
 * The name of Pierre-Olivier Latour may not be used to endorse
 or promote products derived from this software without specific
 prior written permission.
 
 THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 DISCLAIMED. IN NO EVENT SHALL PIERRE-OLIVIER LATOUR BE LIABLE FOR ANY
 DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

#if !__has_feature(objc_arc)
#error GCDWebServer requires ARC
#endif

#import <TargetConditionals.h>
#if TARGET_OS_IPHONE
#import <UIKit/UIKit.h>
#else
#ifdef __GCDWEBSERVER_ENABLE_TESTING__
#import <AppKit/AppKit.h>
#endif
#endif
#import <netinet/in.h>
#import <dns_sd.h>

#import "GCDWebServerPrivate.h"

#if TARGET_OS_IPHONE && !TARGET_IPHONE_SIMULATOR
#define kDefaultPort 80
#else
#define kDefaultPort 8080
#endif

#define kBonjourResolutionTimeout 5.0

NSString* const GCDWebServerOption_Port = @"Port";
NSString* const GCDWebServerOption_BonjourName = @"BonjourName";
NSString* const GCDWebServerOption_BonjourType = @"BonjourType";
NSString* const GCDWebServerOption_RequestNATPortMapping = @"RequestNATPortMapping";
NSString* const GCDWebServerOption_BindToLocalhost = @"BindToLocalhost";
NSString* const GCDWebServerOption_MaxPendingConnections = @"MaxPendingConnections";
NSString* const GCDWebServerOption_ServerName = @"ServerName";
NSString* const GCDWebServerOption_AuthenticationMethod = @"AuthenticationMethod";
NSString* const GCDWebServerOption_AuthenticationRealm = @"AuthenticationRealm";
NSString* const GCDWebServerOption_AuthenticationAccounts = @"AuthenticationAccounts";
NSString* const GCDWebServerOption_ConnectionClass = @"ConnectionClass";
NSString* const GCDWebServerOption_AutomaticallyMapHEADToGET = @"AutomaticallyMapHEADToGET";
NSString* const GCDWebServerOption_ConnectedStateCoalescingInterval = @"ConnectedStateCoalescingInterval";
#if TARGET_OS_IPHONE
NSString* const GCDWebServerOption_AutomaticallySuspendInBackground = @"AutomaticallySuspendInBackground";
#endif

NSString* const GCDWebServerAuthenticationMethod_Basic = @"Basic";
NSString* const GCDWebServerAuthenticationMethod_DigestAccess = @"DigestAccess";

#if defined(__GCDWEBSERVER_LOGGING_FACILITY_BUILTIN__)
#if DEBUG
GCDWebServerLoggingLevel GCDWebServerLogLevel = kGCDWebServerLoggingLevel_Debug;
#else
GCDWebServerLoggingLevel GCDWebServerLogLevel = kGCDWebServerLoggingLevel_Info;
#endif
#elif defined(__GCDWEBSERVER_LOGGING_FACILITY_COCOALUMBERJACK__)
#if DEBUG
DDLogLevel GCDWebServerLogLevel = DDLogLevelDebug;
#else
DDLogLevel GCDWebServerLogLevel = DDLogLevelInfo;
#endif
#endif

#if !TARGET_OS_IPHONE
static BOOL _run;
#endif

#ifdef __GCDWEBSERVER_LOGGING_FACILITY_BUILTIN__

void GCDWebServerLogMessage(GCDWebServerLoggingLevel level, NSString* format, ...) {
  static const char* levelNames[] = {"DEBUG", "VERBOSE", "INFO", "WARNING", "ERROR", "EXCEPTION"};
  static int enableLogging = -1;
  if (enableLogging < 0) {
    enableLogging = (isatty(STDERR_FILENO) ? 1 : 0);
  }
  if (enableLogging) {
    va_list arguments;
    va_start(arguments, format);
    NSString* message = [[NSString alloc] initWithFormat:format arguments:arguments];
    va_end(arguments);
    fprintf(stderr, "[%s] %s\n", levelNames[level], [message UTF8String]);
  }
}

#endif

#if !TARGET_OS_IPHONE

static void _SignalHandler(int signal) {
  _run = NO;
  printf("\n");
}

#endif

#if !TARGET_OS_IPHONE || defined(__GCDWEBSERVER_ENABLE_TESTING__)

// This utility function is used to ensure scheduled callbacks on the main thread are called when running the server synchronously
// https://developer.apple.com/library/mac/documentation/General/Conceptual/ConcurrencyProgrammingGuide/OperationQueues/OperationQueues.html
// The main queue works with the application’s run loop to interleave the execution of queued tasks with the execution of other event sources attached to the run loop
// TODO: Ensure all scheduled blocks on the main queue are also executed
static void _ExecuteMainThreadRunLoopSources() {
  SInt32 result;
  do {
    result = CFRunLoopRunInMode(kCFRunLoopDefaultMode, 0.0, true);
  } while (result == kCFRunLoopRunHandledSource);
}

#endif

@interface GCDWebServerHandler () {
@private
  GCDWebServerMatchBlock _matchBlock;
  GCDWebServerAsyncProcessBlock _asyncProcessBlock;
}
@end

@implementation GCDWebServerHandler

@synthesize matchBlock=_matchBlock, asyncProcessBlock=_asyncProcessBlock;

- (id)initWithMatchBlock:(GCDWebServerMatchBlock)matchBlock asyncProcessBlock:(GCDWebServerAsyncProcessBlock)processBlock {
  if ((self = [super init])) {
    _matchBlock = [matchBlock copy];
    _asyncProcessBlock = [processBlock copy];
  }
  return self;
}

@end

@interface GCDWebServer () {
@private
  id<GCDWebServerDelegate> __unsafe_unretained _delegate;
  dispatch_queue_t _syncQueue;
  dispatch_group_t _sourceGroup;
  NSMutableArray* _handlers;
  NSInteger _activeConnections;  // Accessed through _syncQueue only
  BOOL _connected;  // Accessed on main thread only
  CFRunLoopTimerRef _disconnectTimer;  // Accessed on main thread only
  
  NSDictionary* _options;
  NSString* _serverName;
  NSString* _authenticationRealm;
  NSMutableDictionary* _authenticationBasicAccounts;
  NSMutableDictionary* _authenticationDigestAccounts;
  Class _connectionClass;
  BOOL _mapHEADToGET;
  CFTimeInterval _disconnectDelay;
  NSUInteger _port;
  dispatch_source_t _source4;
  dispatch_source_t _source6;
  CFNetServiceRef _registrationService;
  CFNetServiceRef _resolutionService;
  DNSServiceRef _dnsService;
  CFSocketRef _dnsSocket;
  CFRunLoopSourceRef _dnsSource;
  NSString* _dnsAddress;
  NSUInteger _dnsPort;
  BOOL _bindToLocalhost;
#if TARGET_OS_IPHONE
  BOOL _suspendInBackground;
  UIBackgroundTaskIdentifier _backgroundTask;
#endif
#ifdef __GCDWEBSERVER_ENABLE_TESTING__
  BOOL _recording;
#endif
}
@end

@implementation GCDWebServer

@synthesize delegate=_delegate, handlers=_handlers, port=_port, serverName=_serverName, authenticationRealm=_authenticationRealm,
            authenticationBasicAccounts=_authenticationBasicAccounts, authenticationDigestAccounts=_authenticationDigestAccounts,
            shouldAutomaticallyMapHEADToGET=_mapHEADToGET;

+ (void)initialize {
  GCDWebServerInitializeFunctions();
}

- (instancetype)init {
  if ((self = [super init])) {
    _syncQueue = dispatch_queue_create([NSStringFromClass([self class]) UTF8String], DISPATCH_QUEUE_SERIAL);
    _sourceGroup = dispatch_group_create();
    _handlers = [[NSMutableArray alloc] init];
#if TARGET_OS_IPHONE
    _backgroundTask = UIBackgroundTaskInvalid;
#endif
  }
  return self;
}

- (void)dealloc {
  GWS_DCHECK(_connected == NO);
  GWS_DCHECK(_activeConnections == 0);
  GWS_DCHECK(_options == nil);  // The server can never be dealloc'ed while running because of the retain-cycle with the dispatch source
  GWS_DCHECK(_disconnectTimer == NULL);  // The server can never be dealloc'ed while the disconnect timer is pending because of the retain-cycle
  
#if !OS_OBJECT_USE_OBJC_RETAIN_RELEASE
  dispatch_release(_sourceGroup);
  dispatch_release(_syncQueue);
#endif
}

#if TARGET_OS_IPHONE

// Always called on main thread
- (void)_startBackgroundTask {
  GWS_DCHECK([NSThread isMainThread]);
  if (_backgroundTask == UIBackgroundTaskInvalid) {
    GWS_LOG_DEBUG(@"Did start background task");
    _backgroundTask = [[UIApplication sharedApplication] beginBackgroundTaskWithExpirationHandler:^{
      
      GWS_LOG_WARNING(@"Application is being suspended while %@ is still connected", [self class]);
      [self _endBackgroundTask];
      
    }];
  } else {
    GWS_DNOT_REACHED();
  }
}

#endif

// Always called on main thread
- (void)_didConnect {
  GWS_DCHECK([NSThread isMainThread]);
  GWS_DCHECK(_connected == NO);
  _connected = YES;
  GWS_LOG_DEBUG(@"Did connect");
  
#if TARGET_OS_IPHONE
  if ([[UIApplication sharedApplication] applicationState] != UIApplicationStateBackground) {
    [self _startBackgroundTask];
  }
#endif
  
  if ([_delegate respondsToSelector:@selector(webServerDidConnect:)]) {
    [_delegate webServerDidConnect:self];
  }
}

- (void)willStartConnection:(GCDWebServerConnection*)connection {
  dispatch_sync(_syncQueue, ^{
    
    GWS_DCHECK(_activeConnections >= 0);
    if (_activeConnections == 0) {
      dispatch_async(dispatch_get_main_queue(), ^{
        if (_disconnectTimer) {
          CFRunLoopTimerInvalidate(_disconnectTimer);
          CFRelease(_disconnectTimer);
          _disconnectTimer = NULL;
        }
        if (_connected == NO) {
          [self _didConnect];
        }
      });
    }
    _activeConnections += 1;
    
  });
}

#if TARGET_OS_IPHONE

// Always called on main thread
- (void)_endBackgroundTask {
  GWS_DCHECK([NSThread isMainThread]);
  if (_backgroundTask != UIBackgroundTaskInvalid) {
    if (_suspendInBackground && ([[UIApplication sharedApplication] applicationState] == UIApplicationStateBackground) && _source4) {
      [self _stop];
    }
    [[UIApplication sharedApplication] endBackgroundTask:_backgroundTask];
    _backgroundTask = UIBackgroundTaskInvalid;
    GWS_LOG_DEBUG(@"Did end background task");
  }
}

#endif

// Always called on main thread
- (void)_didDisconnect {
  GWS_DCHECK([NSThread isMainThread]);
  GWS_DCHECK(_connected == YES);
  _connected = NO;
  GWS_LOG_DEBUG(@"Did disconnect");
  
#if TARGET_OS_IPHONE
  [self _endBackgroundTask];
#endif
  
  if ([_delegate respondsToSelector:@selector(webServerDidDisconnect:)]) {
    [_delegate webServerDidDisconnect:self];
  }
}

- (void)didEndConnection:(GCDWebServerConnection*)connection {
  dispatch_sync(_syncQueue, ^{
    GWS_DCHECK(_activeConnections > 0);
    _activeConnections -= 1;
    if (_activeConnections == 0) {
      dispatch_async(dispatch_get_main_queue(), ^{
        if ((_disconnectDelay > 0.0) && (_source4 != NULL)) {
          if (_disconnectTimer) {
            CFRunLoopTimerInvalidate(_disconnectTimer);
            CFRelease(_disconnectTimer);
          }
          _disconnectTimer = CFRunLoopTimerCreateWithHandler(kCFAllocatorDefault, CFAbsoluteTimeGetCurrent() + _disconnectDelay, 0.0, 0, 0, ^(CFRunLoopTimerRef timer) {
            GWS_DCHECK([NSThread isMainThread]);
            [self _didDisconnect];
            CFRelease(_disconnectTimer);
            _disconnectTimer = NULL;
          });
          CFRunLoopAddTimer(CFRunLoopGetMain(), _disconnectTimer, kCFRunLoopCommonModes);
        } else {
          [self _didDisconnect];
        }
      });
    }
  });
}

- (NSString*)bonjourName {
  CFStringRef name = _resolutionService ? CFNetServiceGetName(_resolutionService) : NULL;
  return name && CFStringGetLength(name) ? CFBridgingRelease(CFStringCreateCopy(kCFAllocatorDefault, name)) : nil;
}

- (NSString*)bonjourType {
  CFStringRef type = _resolutionService ? CFNetServiceGetType(_resolutionService) : NULL;
  return type && CFStringGetLength(type) ? CFBridgingRelease(CFStringCreateCopy(kCFAllocatorDefault, type)) : nil;
}

- (void)addHandlerWithMatchBlock:(GCDWebServerMatchBlock)matchBlock processBlock:(GCDWebServerProcessBlock)processBlock {
  [self addHandlerWithMatchBlock:matchBlock asyncProcessBlock:^(GCDWebServerRequest* request, GCDWebServerCompletionBlock completionBlock) {
    completionBlock(processBlock(request));
  }];
}

- (void)addHandlerWithMatchBlock:(GCDWebServerMatchBlock)matchBlock asyncProcessBlock:(GCDWebServerAsyncProcessBlock)processBlock {
  GWS_DCHECK(_options == nil);
  GCDWebServerHandler* handler = [[GCDWebServerHandler alloc] initWithMatchBlock:matchBlock asyncProcessBlock:processBlock];
  [_handlers insertObject:handler atIndex:0];
}

- (void)removeAllHandlers {
  GWS_DCHECK(_options == nil);
  [_handlers removeAllObjects];
}

static void _NetServiceRegisterCallBack(CFNetServiceRef service, CFStreamError* error, void* info) {
  GWS_DCHECK([NSThread isMainThread]);
  @autoreleasepool {
    if (error->error) {
      GWS_LOG_ERROR(@"Bonjour registration error %i (domain %i)", (int)error->error, (int)error->domain);
    } else {
      GCDWebServer* server = (__bridge GCDWebServer*)info;
      GWS_LOG_VERBOSE(@"Bonjour registration complete for %@", [server class]);
      if (!CFNetServiceResolveWithTimeout(server->_resolutionService, kBonjourResolutionTimeout, NULL)) {
        GWS_LOG_ERROR(@"Failed starting Bonjour resolution");
        GWS_DNOT_REACHED();
      }
    }
  }
}

static void _NetServiceResolveCallBack(CFNetServiceRef service, CFStreamError* error, void* info) {
  GWS_DCHECK([NSThread isMainThread]);
  @autoreleasepool {
    if (error->error) {
      if ((error->domain != kCFStreamErrorDomainNetServices) && (error->error != kCFNetServicesErrorTimeout)) {
        GWS_LOG_ERROR(@"Bonjour resolution error %i (domain %i)", (int)error->error, (int)error->domain);
      }
    } else {
      GCDWebServer* server = (__bridge GCDWebServer*)info;
      GWS_LOG_INFO(@"%@ now locally reachable at %@", [server class], server.bonjourServerURL);
      if ([server.delegate respondsToSelector:@selector(webServerDidCompleteBonjourRegistration:)]) {
        [server.delegate webServerDidCompleteBonjourRegistration:server];
      }
    }
  }
}

static void _DNSServiceCallBack(DNSServiceRef sdRef, DNSServiceFlags flags, uint32_t interfaceIndex, DNSServiceErrorType errorCode, uint32_t externalAddress, DNSServiceProtocol protocol, uint16_t internalPort, uint16_t externalPort, uint32_t ttl, void* context) {
  GWS_DCHECK([NSThread isMainThread]);
  @autoreleasepool {
    GCDWebServer* server = (__bridge GCDWebServer*)context;
    if ((errorCode == kDNSServiceErr_NoError) || (errorCode == kDNSServiceErr_DoubleNAT)) {
      struct sockaddr_in addr4;
      bzero(&addr4, sizeof(addr4));
      addr4.sin_len = sizeof(addr4);
      addr4.sin_family = AF_INET;
      addr4.sin_addr.s_addr = externalAddress;  // Already in network byte order
      server->_dnsAddress = GCDWebServerStringFromSockAddr((const struct sockaddr*)&addr4, NO);
      server->_dnsPort = ntohs(externalPort);
      GWS_LOG_INFO(@"%@ now publicly reachable at %@", [server class], server.publicServerURL);
    } else {
      GWS_LOG_ERROR(@"DNS service error %i", errorCode);
      server->_dnsAddress = nil;
      server->_dnsPort = 0;
    }
    if ([server.delegate respondsToSelector:@selector(webServerDidUpdateNATPortMapping:)]) {
      [server.delegate webServerDidUpdateNATPortMapping:server];
    }
  }
}

static void _SocketCallBack(CFSocketRef s, CFSocketCallBackType type, CFDataRef address, const void* data, void* info) {
  GWS_DCHECK([NSThread isMainThread]);
  @autoreleasepool {
    GCDWebServer* server = (__bridge GCDWebServer*)info;
    DNSServiceErrorType status = DNSServiceProcessResult(server->_dnsService);
    if (status != kDNSServiceErr_NoError) {
      GWS_LOG_ERROR(@"DNS service error %i", status);
    }
  }
}

static inline id _GetOption(NSDictionary* options, NSString* key, id defaultValue) {
  id value = [options objectForKey:key];
  return value ? value : defaultValue;
}

static inline NSString* _EncodeBase64(NSString* string) {
  NSData* data = [string dataUsingEncoding:NSUTF8StringEncoding];
#if (TARGET_OS_IPHONE && !(__IPHONE_OS_VERSION_MIN_REQUIRED >= __IPHONE_7_0)) || (!TARGET_OS_IPHONE && !(__MAC_OS_X_VERSION_MIN_REQUIRED >= __MAC_10_9))
  if (![data respondsToSelector:@selector(base64EncodedDataWithOptions:)]) {
    return [data base64Encoding];
  }
#endif
  return [[NSString alloc] initWithData:[data base64EncodedDataWithOptions:0] encoding:NSASCIIStringEncoding];
}

- (int)_createListeningSocket:(BOOL)useIPv6
                 localAddress:(const void*)address
                       length:(socklen_t)length
        maxPendingConnections:(NSUInteger)maxPendingConnections
                        error:(NSError**)error {
  int listeningSocket = socket(useIPv6 ? PF_INET6 : PF_INET, SOCK_STREAM, IPPROTO_TCP);
  if (listeningSocket > 0) {
    int yes = 1;
    setsockopt(listeningSocket, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof(yes));
    
    if (bind(listeningSocket, address, length) == 0) {
      if (listen(listeningSocket, (int)maxPendingConnections) == 0) {
        GWS_LOG_DEBUG(@"Did open %s listening socket %i", useIPv6 ? "IPv6" : "IPv4", listeningSocket);
        return listeningSocket;
      } else {
        if (error) {
          *error = GCDWebServerMakePosixError(errno);
        }
        GWS_LOG_ERROR(@"Failed starting %s listening socket: %s (%i)", useIPv6 ? "IPv6" : "IPv4", strerror(errno), errno);
        close(listeningSocket);
      }
    } else {
      if (error) {
        *error = GCDWebServerMakePosixError(errno);
      }
      GWS_LOG_ERROR(@"Failed binding %s listening socket: %s (%i)", useIPv6 ? "IPv6" : "IPv4", strerror(errno), errno);
      close(listeningSocket);
    }
    
  } else {
    if (error) {
      *error = GCDWebServerMakePosixError(errno);
    }
    GWS_LOG_ERROR(@"Failed creating %s listening socket: %s (%i)", useIPv6 ? "IPv6" : "IPv4", strerror(errno), errno);
  }
  return -1;
}

- (dispatch_source_t)_createDispatchSourceWithListeningSocket:(int)listeningSocket isIPv6:(BOOL)isIPv6 {
  dispatch_group_enter(_sourceGroup);
  dispatch_source_t source = dispatch_source_create(DISPATCH_SOURCE_TYPE_READ, listeningSocket, 0, kGCDWebServerGCDQueue);
  dispatch_source_set_cancel_handler(source, ^{
    
    @autoreleasepool {
      int result = close(listeningSocket);
      if (result != 0) {
        GWS_LOG_ERROR(@"Failed closing %s listening socket: %s (%i)", isIPv6 ? "IPv6" : "IPv4", strerror(errno), errno);
      } else {
        GWS_LOG_DEBUG(@"Did close %s listening socket %i", isIPv6 ? "IPv6" : "IPv4", listeningSocket);
      }
    }
    dispatch_group_leave(_sourceGroup);
    
  });
  dispatch_source_set_event_handler(source, ^{
    
    @autoreleasepool {
      struct sockaddr_storage remoteSockAddr;
      socklen_t remoteAddrLen = sizeof(remoteSockAddr);
      int socket = accept(listeningSocket, (struct sockaddr*)&remoteSockAddr, &remoteAddrLen);
      if (socket > 0) {
        NSData* remoteAddress = [NSData dataWithBytes:&remoteSockAddr length:remoteAddrLen];
        
        struct sockaddr_storage localSockAddr;
        socklen_t localAddrLen = sizeof(localSockAddr);
        NSData* localAddress = nil;
        if (getsockname(socket, (struct sockaddr*)&localSockAddr, &localAddrLen) == 0) {
          localAddress = [NSData dataWithBytes:&localSockAddr length:localAddrLen];
          GWS_DCHECK((!isIPv6 && localSockAddr.ss_family == AF_INET) || (isIPv6 && localSockAddr.ss_family == AF_INET6));
        } else {
          GWS_DNOT_REACHED();
        }
        
        int noSigPipe = 1;
        setsockopt(socket, SOL_SOCKET, SO_NOSIGPIPE, &noSigPipe, sizeof(noSigPipe));  // Make sure this socket cannot generate SIG_PIPE
        
        GCDWebServerConnection* connection = [[_connectionClass alloc] initWithServer:self localAddress:localAddress remoteAddress:remoteAddress socket:socket];  // Connection will automatically retain itself while opened
        [connection self];  // Prevent compiler from complaining about unused variable / useless statement
      } else {
        GWS_LOG_ERROR(@"Failed accepting %s socket: %s (%i)", isIPv6 ? "IPv6" : "IPv4", strerror(errno), errno);
      }
    }
    
  });
  return source;
}

- (BOOL)_start:(NSError**)error {
  GWS_DCHECK(_source4 == NULL);
  
  NSUInteger port = [_GetOption(_options, GCDWebServerOption_Port, @0) unsignedIntegerValue];
  BOOL bindToLocalhost = [_GetOption(_options, GCDWebServerOption_BindToLocalhost, @NO) boolValue];
  NSUInteger maxPendingConnections = [_GetOption(_options, GCDWebServerOption_MaxPendingConnections, @16) unsignedIntegerValue];
  
  struct sockaddr_in addr4;
  bzero(&addr4, sizeof(addr4));
  addr4.sin_len = sizeof(addr4);
  addr4.sin_family = AF_INET;
  addr4.sin_port = htons(port);
  addr4.sin_addr.s_addr = bindToLocalhost ? htonl(INADDR_LOOPBACK) : htonl(INADDR_ANY);
  int listeningSocket4 = [self _createListeningSocket:NO localAddress:&addr4 length:sizeof(addr4) maxPendingConnections:maxPendingConnections error:error];
  if (listeningSocket4 <= 0) {
    return NO;
  }
  if (port == 0) {
    struct sockaddr_in addr;
    socklen_t addrlen = sizeof(addr);
    if (getsockname(listeningSocket4, (struct sockaddr*)&addr, &addrlen) == 0) {
      port = ntohs(addr.sin_port);
    } else {
      GWS_LOG_ERROR(@"Failed retrieving socket address: %s (%i)", strerror(errno), errno);
    }
  }
  
  struct sockaddr_in6 addr6;
  bzero(&addr6, sizeof(addr6));
  addr6.sin6_len = sizeof(addr6);
  addr6.sin6_family = AF_INET6;
  addr6.sin6_port = htons(port);
  addr6.sin6_addr = bindToLocalhost ? in6addr_loopback : in6addr_any;
  int listeningSocket6 = [self _createListeningSocket:YES localAddress:&addr6 length:sizeof(addr6) maxPendingConnections:maxPendingConnections error:error];
  if (listeningSocket6 <= 0) {
    close(listeningSocket4);
    return NO;
  }
  
  _serverName = [_GetOption(_options, GCDWebServerOption_ServerName, NSStringFromClass([self class])) copy];
  NSString* authenticationMethod = _GetOption(_options, GCDWebServerOption_AuthenticationMethod, nil);
  if ([authenticationMethod isEqualToString:GCDWebServerAuthenticationMethod_Basic]) {
    _authenticationRealm = [_GetOption(_options, GCDWebServerOption_AuthenticationRealm, _serverName) copy];
    _authenticationBasicAccounts = [[NSMutableDictionary alloc] init];
    NSDictionary* accounts = _GetOption(_options, GCDWebServerOption_AuthenticationAccounts, @{});
    [accounts enumerateKeysAndObjectsUsingBlock:^(NSString* username, NSString* password, BOOL* stop) {
      [_authenticationBasicAccounts setObject:_EncodeBase64([NSString stringWithFormat:@"%@:%@", username, password]) forKey:username];
    }];
  } else if ([authenticationMethod isEqualToString:GCDWebServerAuthenticationMethod_DigestAccess]) {
    _authenticationRealm = [_GetOption(_options, GCDWebServerOption_AuthenticationRealm, _serverName) copy];
    _authenticationDigestAccounts = [[NSMutableDictionary alloc] init];
    NSDictionary* accounts = _GetOption(_options, GCDWebServerOption_AuthenticationAccounts, @{});
    [accounts enumerateKeysAndObjectsUsingBlock:^(NSString* username, NSString* password, BOOL* stop) {
      [_authenticationDigestAccounts setObject:GCDWebServerComputeMD5Digest(@"%@:%@:%@", username, _authenticationRealm, password) forKey:username];
    }];
  }
  _connectionClass = _GetOption(_options, GCDWebServerOption_ConnectionClass, [GCDWebServerConnection class]);
  _mapHEADToGET = [_GetOption(_options, GCDWebServerOption_AutomaticallyMapHEADToGET, @YES) boolValue];
  _disconnectDelay = [_GetOption(_options, GCDWebServerOption_ConnectedStateCoalescingInterval, @1.0) doubleValue];
  
  _source4 = [self _createDispatchSourceWithListeningSocket:listeningSocket4 isIPv6:NO];
  _source6 = [self _createDispatchSourceWithListeningSocket:listeningSocket6 isIPv6:YES];
  _port = port;
  _bindToLocalhost = bindToLocalhost;
  
  NSString* bonjourName = _GetOption(_options, GCDWebServerOption_BonjourName, nil);
  NSString* bonjourType = _GetOption(_options, GCDWebServerOption_BonjourType, @"_http._tcp");
  if (bonjourName) {
    _registrationService = CFNetServiceCreate(kCFAllocatorDefault, CFSTR("local."), (__bridge CFStringRef)bonjourType, (__bridge CFStringRef)(bonjourName.length ? bonjourName : _serverName), (SInt32)_port);
    if (_registrationService) {
      CFNetServiceClientContext context = {0, (__bridge void*)self, NULL, NULL, NULL};
      
      CFNetServiceSetClient(_registrationService, _NetServiceRegisterCallBack, &context);
      CFNetServiceScheduleWithRunLoop(_registrationService, CFRunLoopGetMain(), kCFRunLoopCommonModes);
      CFStreamError streamError = {0};
      CFNetServiceRegisterWithOptions(_registrationService, 0, &streamError);
      
      _resolutionService = CFNetServiceCreateCopy(kCFAllocatorDefault, _registrationService);
      if (_resolutionService) {
        CFNetServiceSetClient(_resolutionService, _NetServiceResolveCallBack, &context);
        CFNetServiceScheduleWithRunLoop(_resolutionService, CFRunLoopGetMain(), kCFRunLoopCommonModes);
      } else {
        GWS_LOG_ERROR(@"Failed creating CFNetService for resolution");
      }
    } else {
      GWS_LOG_ERROR(@"Failed creating CFNetService for registration");
    }
  }
  
  if ([_GetOption(_options, GCDWebServerOption_RequestNATPortMapping, @NO) boolValue]) {
    DNSServiceErrorType status = DNSServiceNATPortMappingCreate(&_dnsService, 0, 0, kDNSServiceProtocol_TCP, htons(port), htons(port), 0, _DNSServiceCallBack, (__bridge void*)self);
    if (status == kDNSServiceErr_NoError) {
      CFSocketContext context = {0, (__bridge void*)self, NULL, NULL, NULL};
      _dnsSocket = CFSocketCreateWithNative(kCFAllocatorDefault, DNSServiceRefSockFD(_dnsService), kCFSocketReadCallBack, _SocketCallBack, &context);
      if (_dnsSocket) {
        CFSocketSetSocketFlags(_dnsSocket, CFSocketGetSocketFlags(_dnsSocket) & ~kCFSocketCloseOnInvalidate);
        _dnsSource = CFSocketCreateRunLoopSource(kCFAllocatorDefault, _dnsSocket, 0);
        if (_dnsSource) {
          CFRunLoopAddSource(CFRunLoopGetMain(), _dnsSource, kCFRunLoopCommonModes);
        } else {
          GWS_LOG_ERROR(@"Failed creating CFRunLoopSource");
          GWS_DNOT_REACHED();
        }
      } else {
        GWS_LOG_ERROR(@"Failed creating CFSocket");
        GWS_DNOT_REACHED();
      }
    } else {
      GWS_LOG_ERROR(@"Failed creating NAT port mapping (%i)", status);
    }
  }
  
  dispatch_resume(_source4);
  dispatch_resume(_source6);
  GWS_LOG_INFO(@"%@ started on port %i and reachable at %@", [self class], (int)_port, self.serverURL);
  if ([_delegate respondsToSelector:@selector(webServerDidStart:)]) {
    dispatch_async(dispatch_get_main_queue(), ^{
      [_delegate webServerDidStart:self];
    });
  }
  
  return YES;
}

- (void)_stop {
  GWS_DCHECK(_source4 != NULL);
  
  if (_dnsService) {
    _dnsAddress = nil;
    _dnsPort = 0;
    if (_dnsSource) {
      CFRunLoopSourceInvalidate(_dnsSource);
      CFRelease(_dnsSource);
      _dnsSource = NULL;
    }
    if (_dnsSocket) {
      CFRelease(_dnsSocket);
      _dnsSocket = NULL;
    }
    DNSServiceRefDeallocate(_dnsService);
    _dnsService = NULL;
  }
  
  if (_registrationService) {
    if (_resolutionService) {
      CFNetServiceUnscheduleFromRunLoop(_resolutionService, CFRunLoopGetMain(), kCFRunLoopCommonModes);
      CFNetServiceSetClient(_resolutionService, NULL, NULL);
      CFNetServiceCancel(_resolutionService);
      CFRelease(_resolutionService);
      _resolutionService = NULL;
    }
    CFNetServiceUnscheduleFromRunLoop(_registrationService, CFRunLoopGetMain(), kCFRunLoopCommonModes);
    CFNetServiceSetClient(_registrationService, NULL, NULL);
    CFNetServiceCancel(_registrationService);
    CFRelease(_registrationService);
    _registrationService = NULL;
  }
  
  dispatch_source_cancel(_source6);
  dispatch_source_cancel(_source4);
  dispatch_group_wait(_sourceGroup, DISPATCH_TIME_FOREVER);  // Wait until the cancellation handlers have been called which guarantees the listening sockets are closed
#if !OS_OBJECT_USE_OBJC_RETAIN_RELEASE
  dispatch_release(_source6);
#endif
  _source6 = NULL;
#if !OS_OBJECT_USE_OBJC_RETAIN_RELEASE
  dispatch_release(_source4);
#endif
  _source4 = NULL;
  _port = 0;
  _bindToLocalhost = NO;
  
  _serverName = nil;
  _authenticationRealm = nil;
  _authenticationBasicAccounts = nil;
  _authenticationDigestAccounts = nil;
  
  dispatch_async(dispatch_get_main_queue(), ^{
    if (_disconnectTimer) {
      CFRunLoopTimerInvalidate(_disconnectTimer);
      CFRelease(_disconnectTimer);
      _disconnectTimer = NULL;
      [self _didDisconnect];
    }
  });
  
  GWS_LOG_INFO(@"%@ stopped", [self class]);
  if ([_delegate respondsToSelector:@selector(webServerDidStop:)]) {
    dispatch_async(dispatch_get_main_queue(), ^{
      [_delegate webServerDidStop:self];
    });
  }
}

#if TARGET_OS_IPHONE

- (void)_didEnterBackground:(NSNotification*)notification {
  GWS_DCHECK([NSThread isMainThread]);
  GWS_LOG_DEBUG(@"Did enter background");
  if ((_backgroundTask == UIBackgroundTaskInvalid) && _source4) {
    [self _stop];
  }
}

- (void)_willEnterForeground:(NSNotification*)notification {
  GWS_DCHECK([NSThread isMainThread]);
  GWS_LOG_DEBUG(@"Will enter foreground");
  if (!_source4) {
    [self _start:NULL];  // TODO: There's probably nothing we can do on failure
  }
}

#endif

- (BOOL)startWithOptions:(NSDictionary*)options error:(NSError**)error {
  if (_options == nil) {
    _options = options ? [options copy] : @{};
#if TARGET_OS_IPHONE
    _suspendInBackground = [_GetOption(_options, GCDWebServerOption_AutomaticallySuspendInBackground, @YES) boolValue];
    if (((_suspendInBackground == NO) || ([[UIApplication sharedApplication] applicationState] != UIApplicationStateBackground)) && ![self _start:error])
#else
    if (![self _start:error])
#endif
    {
      _options = nil;
      return NO;
    }
#if TARGET_OS_IPHONE
    if (_suspendInBackground) {
      [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(_didEnterBackground:) name:UIApplicationDidEnterBackgroundNotification object:nil];
      [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(_willEnterForeground:) name:UIApplicationWillEnterForegroundNotification object:nil];
    }
#endif
    return YES;
  } else {
    GWS_DNOT_REACHED();
  }
  return NO;
}

- (BOOL)isRunning {
  return (_options ? YES : NO);
}

- (void)stop {
  if (_options) {
#if TARGET_OS_IPHONE
    if (_suspendInBackground) {
      [[NSNotificationCenter defaultCenter] removeObserver:self name:UIApplicationDidEnterBackgroundNotification object:nil];
      [[NSNotificationCenter defaultCenter] removeObserver:self name:UIApplicationWillEnterForegroundNotification object:nil];
    }
#endif
    if (_source4) {
      [self _stop];
    }
    _options = nil;
  } else {
    GWS_DNOT_REACHED();
  }
}

@end

@implementation GCDWebServer (Extensions)

- (NSURL*)serverURL {
  if (_source4) {
    NSString* ipAddress = _bindToLocalhost ? @"localhost" : GCDWebServerGetPrimaryIPAddress(NO);  // We can't really use IPv6 anyway as it doesn't work great with HTTP URLs in practice
    if (ipAddress) {
      if (_port != 80) {
        return [NSURL URLWithString:[NSString stringWithFormat:@"http://%@:%i/", ipAddress, (int)_port]];
      } else {
        return [NSURL URLWithString:[NSString stringWithFormat:@"http://%@/", ipAddress]];
      }
    }
  }
  return nil;
}

- (NSURL*)bonjourServerURL {
  if (_source4 && _resolutionService) {
    NSString* name = (__bridge NSString*)CFNetServiceGetTargetHost(_resolutionService);
    if (name.length) {
      name = [name substringToIndex:(name.length - 1)];  // Strip trailing period at end of domain
      if (_port != 80) {
        return [NSURL URLWithString:[NSString stringWithFormat:@"http://%@:%i/", name, (int)_port]];
      } else {
        return [NSURL URLWithString:[NSString stringWithFormat:@"http://%@/", name]];
      }
    }
  }
  return nil;
}

- (NSURL*)publicServerURL {
  if (_source4 && _dnsService && _dnsAddress && _dnsPort) {
    if (_dnsPort != 80) {
      return [NSURL URLWithString:[NSString stringWithFormat:@"http://%@:%i/", _dnsAddress, (int)_dnsPort]];
    } else {
      return [NSURL URLWithString:[NSString stringWithFormat:@"http://%@/", _dnsAddress]];
    }
  }
  return nil;
}

- (BOOL)start {
  return [self startWithPort:kDefaultPort bonjourName:@""];
}

- (BOOL)startWithPort:(NSUInteger)port bonjourName:(NSString*)name {
  NSMutableDictionary* options = [NSMutableDictionary dictionary];
  [options setObject:[NSNumber numberWithInteger:port] forKey:GCDWebServerOption_Port];
  [options setValue:name forKey:GCDWebServerOption_BonjourName];
  return [self startWithOptions:options error:NULL];
}

#if !TARGET_OS_IPHONE

- (BOOL)runWithPort:(NSUInteger)port bonjourName:(NSString*)name {
  NSMutableDictionary* options = [NSMutableDictionary dictionary];
  [options setObject:[NSNumber numberWithInteger:port] forKey:GCDWebServerOption_Port];
  [options setValue:name forKey:GCDWebServerOption_BonjourName];
  return [self runWithOptions:options error:NULL];
}

- (BOOL)runWithOptions:(NSDictionary*)options error:(NSError**)error {
  GWS_DCHECK([NSThread isMainThread]);
  BOOL success = NO;
  _run = YES;
  void (*termHandler)(int) = signal(SIGTERM, _SignalHandler);
  void (*intHandler)(int) = signal(SIGINT, _SignalHandler);
  if ((termHandler != SIG_ERR) && (intHandler != SIG_ERR)) {
    if ([self startWithOptions:options error:error]) {
      while (_run) {
        CFRunLoopRunInMode(kCFRunLoopDefaultMode, 1.0, true);
      }
      [self stop];
      success = YES;
    }
    _ExecuteMainThreadRunLoopSources();
    signal(SIGINT, intHandler);
    signal(SIGTERM, termHandler);
  }
  return success;
}

#endif

@end

@implementation GCDWebServer (Handlers)

- (void)addDefaultHandlerForMethod:(NSString*)method requestClass:(Class)aClass processBlock:(GCDWebServerProcessBlock)block {
  [self addDefaultHandlerForMethod:method requestClass:aClass asyncProcessBlock:^(GCDWebServerRequest* request, GCDWebServerCompletionBlock completionBlock) {
    completionBlock(block(request));
  }];
}

- (void)addDefaultHandlerForMethod:(NSString*)method requestClass:(Class)aClass asyncProcessBlock:(GCDWebServerAsyncProcessBlock)block {
  [self addHandlerWithMatchBlock:^GCDWebServerRequest *(NSString* requestMethod, NSURL* requestURL, NSDictionary* requestHeaders, NSString* urlPath, NSDictionary* urlQuery) {
    
    if (![requestMethod isEqualToString:method]) {
      return nil;
    }
    return [[aClass alloc] initWithMethod:requestMethod url:requestURL headers:requestHeaders path:urlPath query:urlQuery];
    
  } asyncProcessBlock:block];
}

- (void)addHandlerForMethod:(NSString*)method path:(NSString*)path requestClass:(Class)aClass processBlock:(GCDWebServerProcessBlock)block {
  [self addHandlerForMethod:method path:path requestClass:aClass asyncProcessBlock:^(GCDWebServerRequest* request, GCDWebServerCompletionBlock completionBlock) {
    completionBlock(block(request));
  }];
}

- (void)addHandlerForMethod:(NSString*)method path:(NSString*)path requestClass:(Class)aClass asyncProcessBlock:(GCDWebServerAsyncProcessBlock)block {
  if ([path hasPrefix:@"/"] && [aClass isSubclassOfClass:[GCDWebServerRequest class]]) {
    [self addHandlerWithMatchBlock:^GCDWebServerRequest *(NSString* requestMethod, NSURL* requestURL, NSDictionary* requestHeaders, NSString* urlPath, NSDictionary* urlQuery) {
      
      if (![requestMethod isEqualToString:method]) {
        return nil;
      }
      if ([urlPath caseInsensitiveCompare:path] != NSOrderedSame) {
        return nil;
      }
      return [[aClass alloc] initWithMethod:requestMethod url:requestURL headers:requestHeaders path:urlPath query:urlQuery];
      
    } asyncProcessBlock:block];
  } else {
    GWS_DNOT_REACHED();
  }
}

- (void)addHandlerForMethod:(NSString*)method pathRegex:(NSString*)regex requestClass:(Class)aClass processBlock:(GCDWebServerProcessBlock)block {
  [self addHandlerForMethod:method pathRegex:regex requestClass:aClass asyncProcessBlock:^(GCDWebServerRequest* request, GCDWebServerCompletionBlock completionBlock) {
    completionBlock(block(request));
  }];
}

- (void)addHandlerForMethod:(NSString*)method pathRegex:(NSString*)regex requestClass:(Class)aClass asyncProcessBlock:(GCDWebServerAsyncProcessBlock)block {
  NSRegularExpression* expression = [NSRegularExpression regularExpressionWithPattern:regex options:NSRegularExpressionCaseInsensitive error:NULL];
  if (expression && [aClass isSubclassOfClass:[GCDWebServerRequest class]]) {
    [self addHandlerWithMatchBlock:^GCDWebServerRequest *(NSString* requestMethod, NSURL* requestURL, NSDictionary* requestHeaders, NSString* urlPath, NSDictionary* urlQuery) {
      
      if (![requestMethod isEqualToString:method]) {
        return nil;
      }

      NSArray* matches = [expression matchesInString:urlPath options:0 range:NSMakeRange(0, urlPath.length)];
      if (matches.count == 0) {
        return nil;
      }

      NSMutableArray* captures = [NSMutableArray array];
      for (NSTextCheckingResult* result in matches) {
        // Start at 1; index 0 is the whole string
        for (NSUInteger i = 1; i < result.numberOfRanges; i++) {
          [captures addObject:[urlPath substringWithRange:[result rangeAtIndex:i]]];
        }
      }

      GCDWebServerRequest* request = [[aClass alloc] initWithMethod:requestMethod url:requestURL headers:requestHeaders path:urlPath query:urlQuery];
      [request setAttribute:captures forKey:GCDWebServerRequestAttribute_RegexCaptures];
      return request;
      
    } asyncProcessBlock:block];
  } else {
    GWS_DNOT_REACHED();
  }
}

@end

@implementation GCDWebServer (GETHandlers)

- (void)addGETHandlerForPath:(NSString*)path staticData:(NSData*)staticData contentType:(NSString*)contentType cacheAge:(NSUInteger)cacheAge {
  [self addHandlerForMethod:@"GET" path:path requestClass:[GCDWebServerRequest class] processBlock:^GCDWebServerResponse *(GCDWebServerRequest* request) {
    
    GCDWebServerResponse* response = [GCDWebServerDataResponse responseWithData:staticData contentType:contentType];
    response.cacheControlMaxAge = cacheAge;
    return response;
    
  }];
}

- (void)addGETHandlerForPath:(NSString*)path filePath:(NSString*)filePath isAttachment:(BOOL)isAttachment cacheAge:(NSUInteger)cacheAge allowRangeRequests:(BOOL)allowRangeRequests {
  [self addHandlerForMethod:@"GET" path:path requestClass:[GCDWebServerRequest class] processBlock:^GCDWebServerResponse *(GCDWebServerRequest* request) {
    
    GCDWebServerResponse* response = nil;
    if (allowRangeRequests) {
      response = [GCDWebServerFileResponse responseWithFile:filePath byteRange:request.byteRange isAttachment:isAttachment];
      [response setValue:@"bytes" forAdditionalHeader:@"Accept-Ranges"];
    } else {
      response = [GCDWebServerFileResponse responseWithFile:filePath isAttachment:isAttachment];
    }
    response.cacheControlMaxAge = cacheAge;
    return response;
    
  }];
}

- (GCDWebServerResponse*)_responseWithContentsOfDirectory:(NSString*)path {
  NSDirectoryEnumerator* enumerator = [[NSFileManager defaultManager] enumeratorAtPath:path];
  if (enumerator == nil) {
    return nil;
  }
  NSMutableString* html = [NSMutableString string];
  [html appendString:@"<!DOCTYPE html>\n"];
  [html appendString:@"<html><head><meta charset=\"utf-8\"></head><body>\n"];
  [html appendString:@"<ul>\n"];
  for (NSString* file in enumerator) {
    if (![file hasPrefix:@"."]) {
      NSString* type = [[enumerator fileAttributes] objectForKey:NSFileType];
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
      NSString* escapedFile = [file stringByAddingPercentEscapesUsingEncoding:NSUTF8StringEncoding];
#pragma clang diagnostic pop
      GWS_DCHECK(escapedFile);
      if ([type isEqualToString:NSFileTypeRegular]) {
        [html appendFormat:@"<li><a href=\"%@\">%@</a></li>\n", escapedFile, file];
      } else if ([type isEqualToString:NSFileTypeDirectory]) {
        [html appendFormat:@"<li><a href=\"%@/\">%@/</a></li>\n", escapedFile, file];
      }
    }
    [enumerator skipDescendents];
  }
  [html appendString:@"</ul>\n"];
  [html appendString:@"</body></html>\n"];
  return [GCDWebServerDataResponse responseWithHTML:html];
}

- (void)addGETHandlerForBasePath:(NSString*)basePath directoryPath:(NSString*)directoryPath indexFilename:(NSString*)indexFilename cacheAge:(NSUInteger)cacheAge allowRangeRequests:(BOOL)allowRangeRequests {
  if ([basePath hasPrefix:@"/"] && [basePath hasSuffix:@"/"]) {
    GCDWebServer* __unsafe_unretained server = self;
    [self addHandlerWithMatchBlock:^GCDWebServerRequest *(NSString* requestMethod, NSURL* requestURL, NSDictionary* requestHeaders, NSString* urlPath, NSDictionary* urlQuery) {
      
      if (![requestMethod isEqualToString:@"GET"]) {
        return nil;
      }
      if (![urlPath hasPrefix:basePath]) {
        return nil;
      }
      return [[GCDWebServerRequest alloc] initWithMethod:requestMethod url:requestURL headers:requestHeaders path:urlPath query:urlQuery];
      
    } processBlock:^GCDWebServerResponse *(GCDWebServerRequest* request) {
      
      GCDWebServerResponse* response = nil;
      NSString* filePath = [directoryPath stringByAppendingPathComponent:[request.path substringFromIndex:basePath.length]];
      NSString* fileType = [[[NSFileManager defaultManager] attributesOfItemAtPath:filePath error:NULL] fileType];
      if (fileType) {
        if ([fileType isEqualToString:NSFileTypeDirectory]) {
          if (indexFilename) {
            NSString* indexPath = [filePath stringByAppendingPathComponent:indexFilename];
            NSString* indexType = [[[NSFileManager defaultManager] attributesOfItemAtPath:indexPath error:NULL] fileType];
            if ([indexType isEqualToString:NSFileTypeRegular]) {
              return [GCDWebServerFileResponse responseWithFile:indexPath];
            }
          }
          response = [server _responseWithContentsOfDirectory:filePath];
        } else if ([fileType isEqualToString:NSFileTypeRegular]) {
          if (allowRangeRequests) {
            response = [GCDWebServerFileResponse responseWithFile:filePath byteRange:request.byteRange];
            [response setValue:@"bytes" forAdditionalHeader:@"Accept-Ranges"];
          } else {
            response = [GCDWebServerFileResponse responseWithFile:filePath];
          }
        }
      }
      if (response) {
        response.cacheControlMaxAge = cacheAge;
      } else {
        response = [GCDWebServerResponse responseWithStatusCode:kGCDWebServerHTTPStatusCode_NotFound];
      }
      return response;
      
    }];
  } else {
    GWS_DNOT_REACHED();
  }
}

@end

@implementation GCDWebServer (Logging)

+ (void)setLogLevel:(int)level {
#if defined(__GCDWEBSERVER_LOGGING_FACILITY_XLFACILITY__)
  [XLSharedFacility setMinLogLevel:level];
#elif defined(__GCDWEBSERVER_LOGGING_FACILITY_COCOALUMBERJACK__)
  GCDWebServerLogLevel = level;
#elif defined(__GCDWEBSERVER_LOGGING_FACILITY_BUILTIN__)
  GCDWebServerLogLevel = level;
#endif
}

- (void)logVerbose:(NSString*)format, ... {
  va_list arguments;
  va_start(arguments, format);
  GWS_LOG_VERBOSE(@"%@", [[NSString alloc] initWithFormat:format arguments:arguments]);
  va_end(arguments);
}

- (void)logInfo:(NSString*)format, ... {
  va_list arguments;
  va_start(arguments, format);
  GWS_LOG_INFO(@"%@", [[NSString alloc] initWithFormat:format arguments:arguments]);
  va_end(arguments);
}

- (void)logWarning:(NSString*)format, ... {
  va_list arguments;
  va_start(arguments, format);
  GWS_LOG_WARNING(@"%@", [[NSString alloc] initWithFormat:format arguments:arguments]);
  va_end(arguments);
}

- (void)logError:(NSString*)format, ... {
  va_list arguments;
  va_start(arguments, format);
  GWS_LOG_ERROR(@"%@", [[NSString alloc] initWithFormat:format arguments:arguments]);
  va_end(arguments);
}

- (void)logException:(NSException*)exception {
  GWS_LOG_EXCEPTION(exception);
}

@end

#ifdef __GCDWEBSERVER_ENABLE_TESTING__

@implementation GCDWebServer (Testing)

- (void)setRecordingEnabled:(BOOL)flag {
  _recording = flag;
}

- (BOOL)isRecordingEnabled {
  return _recording;
}

static CFHTTPMessageRef _CreateHTTPMessageFromData(NSData* data, BOOL isRequest) {
  CFHTTPMessageRef message = CFHTTPMessageCreateEmpty(kCFAllocatorDefault, isRequest);
  if (CFHTTPMessageAppendBytes(message, data.bytes, data.length)) {
    return message;
  }
  CFRelease(message);
  return NULL;
}

static CFHTTPMessageRef _CreateHTTPMessageFromPerformingRequest(NSData* inData, NSUInteger port) {
  CFHTTPMessageRef response = NULL;
  int httpSocket = socket(PF_INET, SOCK_STREAM, IPPROTO_TCP);
  if (httpSocket > 0) {
    struct sockaddr_in addr4;
    bzero(&addr4, sizeof(addr4));
    addr4.sin_len = sizeof(port);
    addr4.sin_family = AF_INET;
    addr4.sin_port = htons(8080);
    addr4.sin_addr.s_addr = htonl(INADDR_ANY);
    if (connect(httpSocket, (void*)&addr4, sizeof(addr4)) == 0) {
      if (write(httpSocket, inData.bytes, inData.length) == (ssize_t)inData.length) {
        NSMutableData* outData = [[NSMutableData alloc] initWithLength:(256 * 1024)];
        NSUInteger length = 0;
        while (1) {
          ssize_t result = read(httpSocket, (char*)outData.mutableBytes + length, outData.length - length);
          if (result < 0) {
            length = NSUIntegerMax;
            break;
          } else if (result == 0) {
            break;
          }
          length += result;
          if (length >= outData.length) {
            outData.length = 2 * outData.length;
          }
        }
        if (length != NSUIntegerMax) {
          outData.length = length;
          response = _CreateHTTPMessageFromData(outData, NO);
        } else {
          GWS_DNOT_REACHED();
        }
      }
    }
    close(httpSocket);
  }
  return response;
}

static void _LogResult(NSString* format, ...) {
  va_list arguments;
  va_start(arguments, format);
  NSString* message = [[NSString alloc] initWithFormat:format arguments:arguments];
  va_end(arguments);
  fprintf(stdout, "%s\n", [message UTF8String]);
}

- (NSInteger)runTestsWithOptions:(NSDictionary*)options inDirectory:(NSString*)path {
  GWS_DCHECK([NSThread isMainThread]);
  NSArray* ignoredHeaders = @[@"Date", @"Etag"];  // Dates are always different by definition and ETags depend on file system node IDs
  NSInteger result = -1;
  if ([self startWithOptions:options error:NULL]) {
    _ExecuteMainThreadRunLoopSources();
    
    result = 0;
    NSArray* files = [[NSFileManager defaultManager] contentsOfDirectoryAtPath:path error:NULL];
    for (NSString* requestFile in files) {
      if (![requestFile hasSuffix:@".request"]) {
        continue;
      }
      @autoreleasepool {
        NSString* index = [[requestFile componentsSeparatedByString:@"-"] firstObject];
        BOOL success = NO;
        NSData* requestData = [NSData dataWithContentsOfFile:[path stringByAppendingPathComponent:requestFile]];
        if (requestData) {
          CFHTTPMessageRef request = _CreateHTTPMessageFromData(requestData, YES);
          if (request) {
            NSString* requestMethod = CFBridgingRelease(CFHTTPMessageCopyRequestMethod(request));
            NSURL* requestURL = CFBridgingRelease(CFHTTPMessageCopyRequestURL(request));
            _LogResult(@"[%i] %@ %@", (int)[index integerValue], requestMethod, requestURL.path);
            NSString* prefix = [index stringByAppendingString:@"-"];
            for (NSString* responseFile in files) {
              if ([responseFile hasPrefix:prefix] && [responseFile hasSuffix:@".response"]) {
                NSData* responseData = [NSData dataWithContentsOfFile:[path stringByAppendingPathComponent:responseFile]];
                if (responseData) {
                CFHTTPMessageRef expectedResponse = _CreateHTTPMessageFromData(responseData, NO);
                  if (expectedResponse) {
                    CFHTTPMessageRef actualResponse = _CreateHTTPMessageFromPerformingRequest(requestData, self.port);
                    if (actualResponse) {
                      success = YES;
                      
                      CFIndex expectedStatusCode = CFHTTPMessageGetResponseStatusCode(expectedResponse);
                      CFIndex actualStatusCode = CFHTTPMessageGetResponseStatusCode(actualResponse);
                      if (actualStatusCode != expectedStatusCode) {
                        _LogResult(@"  Status code not matching:\n    Expected: %i\n      Actual: %i", (int)expectedStatusCode, (int)actualStatusCode);
                        success = NO;
                      }
                      
                      NSDictionary* expectedHeaders = CFBridgingRelease(CFHTTPMessageCopyAllHeaderFields(expectedResponse));
                      NSDictionary* actualHeaders = CFBridgingRelease(CFHTTPMessageCopyAllHeaderFields(actualResponse));
                      for (NSString* expectedHeader in expectedHeaders) {
                        if ([ignoredHeaders containsObject:expectedHeader]) {
                          continue;
                        }
                        NSString* expectedValue = [expectedHeaders objectForKey:expectedHeader];
                        NSString* actualValue = [actualHeaders objectForKey:expectedHeader];
                        if (![actualValue isEqualToString:expectedValue]) {
                          _LogResult(@"  Header '%@' not matching:\n    Expected: \"%@\"\n      Actual: \"%@\"", expectedHeader, expectedValue, actualValue);
                          success = NO;
                        }
                      }
                      for (NSString* actualHeader in actualHeaders) {
                        if (![expectedHeaders objectForKey:actualHeader]) {
                          _LogResult(@"  Header '%@' not matching:\n    Expected: \"%@\"\n      Actual: \"%@\"", actualHeader, nil, [actualHeaders objectForKey:actualHeader]);
                          success = NO;
                        }
                      }
                      
                      NSString* expectedContentLength = CFBridgingRelease(CFHTTPMessageCopyHeaderFieldValue(expectedResponse, CFSTR("Content-Length")));
                      NSData* expectedBody = CFBridgingRelease(CFHTTPMessageCopyBody(expectedResponse));
                      NSString* actualContentLength = CFBridgingRelease(CFHTTPMessageCopyHeaderFieldValue(actualResponse, CFSTR("Content-Length")));
                      NSData* actualBody = CFBridgingRelease(CFHTTPMessageCopyBody(actualResponse));
                      if ([actualContentLength isEqualToString:expectedContentLength] && (actualBody.length > expectedBody.length)) {  // Handle web browser closing connection before retrieving entire body (e.g. when playing a video file)
                        actualBody = [actualBody subdataWithRange:NSMakeRange(0, expectedBody.length)];
                      }
                      if (![actualBody isEqualToData:expectedBody]) {
                        _LogResult(@"  Bodies not matching:\n    Expected: %lu bytes\n      Actual: %lu bytes", (unsigned long)expectedBody.length, (unsigned long)actualBody.length);
                        success = NO;
#if !TARGET_OS_IPHONE
#if DEBUG
                        if (GCDWebServerIsTextContentType([expectedHeaders objectForKey:@"Content-Type"])) {
                          NSString* expectedPath = [NSTemporaryDirectory() stringByAppendingPathComponent:[[[NSProcessInfo processInfo] globallyUniqueString] stringByAppendingPathExtension:@"txt"]];
                          NSString* actualPath = [NSTemporaryDirectory() stringByAppendingPathComponent:[[[NSProcessInfo processInfo] globallyUniqueString] stringByAppendingPathExtension:@"txt"]];
                          if ([expectedBody writeToFile:expectedPath atomically:YES] && [actualBody writeToFile:actualPath atomically:YES]) {
                            NSTask* task = [[NSTask alloc] init];
                            [task setLaunchPath:@"/usr/bin/opendiff"];
                            [task setArguments:@[expectedPath, actualPath]];
                            [task launch];
                          }
                        }
#endif
#endif
                      }
                      
                      CFRelease(actualResponse);
                    }
                    CFRelease(expectedResponse);
                  }
                } else {
                  GWS_DNOT_REACHED();
                }
                break;
              }
            }
            CFRelease(request);
          }
        } else {
          GWS_DNOT_REACHED();
        }
        _LogResult(@"");
        if (!success) {
          ++result;
        }
      }
      _ExecuteMainThreadRunLoopSources();
    }
    
    [self stop];
    
    _ExecuteMainThreadRunLoopSources();
  }
  return result;
}

@end

#endif
