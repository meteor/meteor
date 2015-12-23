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

#import <os/object.h>
#import <sys/socket.h>

/**
 *  All GCDWebServer headers.
 */

#import "GCDWebServerHTTPStatusCodes.h"
#import "GCDWebServerFunctions.h"

#import "GCDWebServer.h"
#import "GCDWebServerConnection.h"

#import "GCDWebServerDataRequest.h"
#import "GCDWebServerFileRequest.h"
#import "GCDWebServerMultiPartFormRequest.h"
#import "GCDWebServerURLEncodedFormRequest.h"

#import "GCDWebServerDataResponse.h"
#import "GCDWebServerErrorResponse.h"
#import "GCDWebServerFileResponse.h"
#import "GCDWebServerStreamedResponse.h"

/**
 *  Check if a custom logging facility should be used instead.
 */

#if defined(__GCDWEBSERVER_LOGGING_HEADER__)

#define __GCDWEBSERVER_LOGGING_FACILITY_CUSTOM__

#import __GCDWEBSERVER_LOGGING_HEADER__

/**
 *  Automatically detect if XLFacility is available and if so use it as a
 *  logging facility.
 */

#elif defined(__has_include) && __has_include("XLFacilityMacros.h")

#define __GCDWEBSERVER_LOGGING_FACILITY_XLFACILITY__

#undef XLOG_TAG
#define XLOG_TAG @"gcdwebserver.internal"

#import "XLFacilityMacros.h"

#define GWS_LOG_DEBUG(...) XLOG_DEBUG(__VA_ARGS__)
#define GWS_LOG_VERBOSE(...) XLOG_VERBOSE(__VA_ARGS__)
#define GWS_LOG_INFO(...) XLOG_INFO(__VA_ARGS__)
#define GWS_LOG_WARNING(...) XLOG_WARNING(__VA_ARGS__)
#define GWS_LOG_ERROR(...) XLOG_ERROR(__VA_ARGS__)
#define GWS_LOG_EXCEPTION(__EXCEPTION__) XLOG_EXCEPTION(__EXCEPTION__)

#define GWS_DCHECK(__CONDITION__) XLOG_DEBUG_CHECK(__CONDITION__)
#define GWS_DNOT_REACHED() XLOG_DEBUG_UNREACHABLE()

/**
 *  Automatically detect if CocoaLumberJack is available and if so use
 *  it as a logging facility.
 */

#elif defined(__has_include) && __has_include("CocoaLumberjack/CocoaLumberjack.h")

#import <CocoaLumberjack/CocoaLumberjack.h>

#define __GCDWEBSERVER_LOGGING_FACILITY_COCOALUMBERJACK__

#undef LOG_LEVEL_DEF
#define LOG_LEVEL_DEF GCDWebServerLogLevel
extern DDLogLevel GCDWebServerLogLevel;

#define GWS_LOG_DEBUG(...) DDLogDebug(__VA_ARGS__)
#define GWS_LOG_VERBOSE(...) DDLogVerbose(__VA_ARGS__)
#define GWS_LOG_INFO(...) DDLogInfo(__VA_ARGS__)
#define GWS_LOG_WARNING(...) DDLogWarn(__VA_ARGS__)
#define GWS_LOG_ERROR(...) DDLogError(__VA_ARGS__)
#define GWS_LOG_EXCEPTION(__EXCEPTION__) DDLogError(@"%@", __EXCEPTION__)

/**
 *  If all of the above fail, then use GCDWebServer built-in
 *  logging facility.
 */

#else

#define __GCDWEBSERVER_LOGGING_FACILITY_BUILTIN__

typedef NS_ENUM(int, GCDWebServerLoggingLevel) {
  kGCDWebServerLoggingLevel_Debug = 0,
  kGCDWebServerLoggingLevel_Verbose,
  kGCDWebServerLoggingLevel_Info,
  kGCDWebServerLoggingLevel_Warning,
  kGCDWebServerLoggingLevel_Error,
  kGCDWebServerLoggingLevel_Exception
};

extern GCDWebServerLoggingLevel GCDWebServerLogLevel;
extern void GCDWebServerLogMessage(GCDWebServerLoggingLevel level, NSString* format, ...) NS_FORMAT_FUNCTION(2, 3);

#if DEBUG
#define GWS_LOG_DEBUG(...) do { if (GCDWebServerLogLevel <= kGCDWebServerLoggingLevel_Debug) GCDWebServerLogMessage(kGCDWebServerLoggingLevel_Debug, __VA_ARGS__); } while (0)
#else
#define GWS_LOG_DEBUG(...)
#endif
#define GWS_LOG_VERBOSE(...) do { if (GCDWebServerLogLevel <= kGCDWebServerLoggingLevel_Verbose) GCDWebServerLogMessage(kGCDWebServerLoggingLevel_Verbose, __VA_ARGS__); } while (0)
#define GWS_LOG_INFO(...) do { if (GCDWebServerLogLevel <= kGCDWebServerLoggingLevel_Info) GCDWebServerLogMessage(kGCDWebServerLoggingLevel_Info, __VA_ARGS__); } while (0)
#define GWS_LOG_WARNING(...) do { if (GCDWebServerLogLevel <= kGCDWebServerLoggingLevel_Warning) GCDWebServerLogMessage(kGCDWebServerLoggingLevel_Warning, __VA_ARGS__); } while (0)
#define GWS_LOG_ERROR(...) do { if (GCDWebServerLogLevel <= kGCDWebServerLoggingLevel_Error) GCDWebServerLogMessage(kGCDWebServerLoggingLevel_Error, __VA_ARGS__); } while (0)
#define GWS_LOG_EXCEPTION(__EXCEPTION__) do { if (GCDWebServerLogLevel <= kGCDWebServerLoggingLevel_Exception) GCDWebServerLogMessage(kGCDWebServerLoggingLevel_Exception, @"%@", __EXCEPTION__); } while (0)

#endif

/**
 *  Consistency check macros used when building Debug only.
 */

#if !defined(GWS_DCHECK) || !defined(GWS_DNOT_REACHED)

#if DEBUG

#define GWS_DCHECK(__CONDITION__) \
  do { \
    if (!(__CONDITION__)) { \
      abort(); \
    } \
  } while (0)
#define GWS_DNOT_REACHED() abort()

#else

#define GWS_DCHECK(__CONDITION__)
#define GWS_DNOT_REACHED()

#endif

#endif

/**
 *  GCDWebServer internal constants and APIs.
 */

#define kGCDWebServerDefaultMimeType @"application/octet-stream"
#define kGCDWebServerGCDQueue dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0)
#define kGCDWebServerErrorDomain @"GCDWebServerErrorDomain"

static inline BOOL GCDWebServerIsValidByteRange(NSRange range) {
  return ((range.location != NSUIntegerMax) || (range.length > 0));
}

static inline NSError* GCDWebServerMakePosixError(int code) {
  return [NSError errorWithDomain:NSPOSIXErrorDomain code:code userInfo:@{NSLocalizedDescriptionKey: [NSString stringWithUTF8String:strerror(code)]}];
}

extern void GCDWebServerInitializeFunctions();
extern NSString* GCDWebServerNormalizeHeaderValue(NSString* value);
extern NSString* GCDWebServerTruncateHeaderValue(NSString* value);
extern NSString* GCDWebServerExtractHeaderValueParameter(NSString* header, NSString* attribute);
extern NSStringEncoding GCDWebServerStringEncodingFromCharset(NSString* charset);
extern BOOL GCDWebServerIsTextContentType(NSString* type);
extern NSString* GCDWebServerDescribeData(NSData* data, NSString* contentType);
extern NSString* GCDWebServerComputeMD5Digest(NSString* format, ...) NS_FORMAT_FUNCTION(1,2);
extern NSString* GCDWebServerStringFromSockAddr(const struct sockaddr* addr, BOOL includeService);

@interface GCDWebServerConnection ()
- (id)initWithServer:(GCDWebServer*)server localAddress:(NSData*)localAddress remoteAddress:(NSData*)remoteAddress socket:(CFSocketNativeHandle)socket;
@end

@interface GCDWebServer ()
@property(nonatomic, readonly) NSArray* handlers;
@property(nonatomic, readonly) NSString* serverName;
@property(nonatomic, readonly) NSString* authenticationRealm;
@property(nonatomic, readonly) NSDictionary* authenticationBasicAccounts;
@property(nonatomic, readonly) NSDictionary* authenticationDigestAccounts;
@property(nonatomic, readonly) BOOL shouldAutomaticallyMapHEADToGET;
- (void)willStartConnection:(GCDWebServerConnection*)connection;
- (void)didEndConnection:(GCDWebServerConnection*)connection;
@end

@interface GCDWebServerHandler : NSObject
@property(nonatomic, readonly) GCDWebServerMatchBlock matchBlock;
@property(nonatomic, readonly) GCDWebServerAsyncProcessBlock asyncProcessBlock;
@end

@interface GCDWebServerRequest ()
@property(nonatomic, readonly) BOOL usesChunkedTransferEncoding;
@property(nonatomic, readwrite) NSData* localAddressData;
@property(nonatomic, readwrite) NSData* remoteAddressData;
- (void)prepareForWriting;
- (BOOL)performOpen:(NSError**)error;
- (BOOL)performWriteData:(NSData*)data error:(NSError**)error;
- (BOOL)performClose:(NSError**)error;
- (void)setAttribute:(id)attribute forKey:(NSString*)key;
@end

@interface GCDWebServerResponse ()
@property(nonatomic, readonly) NSDictionary* additionalHeaders;
@property(nonatomic, readonly) BOOL usesChunkedTransferEncoding;
- (void)prepareForReading;
- (BOOL)performOpen:(NSError**)error;
- (void)performReadDataWithCompletion:(GCDWebServerBodyReaderCompletionBlock)block;
- (void)performClose;
@end
