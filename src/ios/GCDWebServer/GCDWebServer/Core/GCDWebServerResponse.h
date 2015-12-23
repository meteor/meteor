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

#import <Foundation/Foundation.h>

/**
 *  The GCDWebServerBodyReaderCompletionBlock is passed by GCDWebServer to the
 *  GCDWebServerBodyReader object when reading data from it asynchronously.
 */
typedef void (^GCDWebServerBodyReaderCompletionBlock)(NSData* data, NSError* error);

/**
 *  This protocol is used by the GCDWebServerConnection to communicate with
 *  the GCDWebServerResponse and read the HTTP body data to send.
 *
 *  Note that multiple GCDWebServerBodyReader objects can be chained together
 *  internally e.g. to automatically apply gzip encoding to the content before
 *  passing it on to the GCDWebServerResponse.
 *
 *  @warning These methods can be called on any GCD thread.
 */
@protocol GCDWebServerBodyReader <NSObject>

@required

/**
 *  This method is called before any body data is sent.
 *
 *  It should return YES on success or NO on failure and set the "error" argument
 *  which is guaranteed to be non-NULL.
 */
- (BOOL)open:(NSError**)error;

/**
 *  This method is called whenever body data is sent.
 *
 *  It should return a non-empty NSData if there is body data available,
 *  or an empty NSData there is no more body data, or nil on error and set
 *  the "error" argument which is guaranteed to be non-NULL.
 */
- (NSData*)readData:(NSError**)error;

/**
 *  This method is called after all body data has been sent.
 */
- (void)close;

@optional

/**
 *  If this method is implemented, it will be preferred over -readData:.
 *
 *  It must call the passed block when data is available, passing a non-empty
 *  NSData if there is body data available, or an empty NSData there is no more
 *  body data, or nil on error and pass an NSError along.
 */
- (void)asyncReadDataWithCompletion:(GCDWebServerBodyReaderCompletionBlock)block;

@end

/**
 *  The GCDWebServerResponse class is used to wrap a single HTTP response.
 *  It is instantiated by the handler of the GCDWebServer that handled the request.
 *  If a body is present, the methods from the GCDWebServerBodyReader protocol
 *  will be called by the GCDWebServerConnection to send it.
 *
 *  The default implementation of the GCDWebServerBodyReader protocol
 *  on the class simply returns an empty body.
 *
 *  @warning GCDWebServerResponse instances can be created and used on any GCD thread.
 */
@interface GCDWebServerResponse : NSObject <GCDWebServerBodyReader>

/**
 *  Sets the content type for the body of the response.
 *
 *  The default value is nil i.e. the response has no body.
 *
 *  @warning This property must be set if a body is present.
 */
@property(nonatomic, copy) NSString* contentType;

/**
 *  Sets the content length for the body of the response. If a body is present
 *  but this property is set to "NSUIntegerMax", this means the length of the body
 *  cannot be known ahead of time. Chunked transfer encoding will be
 *  automatically enabled by the GCDWebServerConnection to comply with HTTP/1.1
 *  specifications.
 *
 *  The default value is "NSUIntegerMax" i.e. the response has no body or its length
 *  is undefined.
 */
@property(nonatomic) NSUInteger contentLength;

/**
 *  Sets the HTTP status code for the response.
 *
 *  The default value is 200 i.e. "OK".
 */
@property(nonatomic) NSInteger statusCode;

/**
 *  Sets the caching hint for the response using the "Cache-Control" header.
 *  This value is expressed in seconds.
 *
 *  The default value is 0 i.e. "no-cache".
 */
@property(nonatomic) NSUInteger cacheControlMaxAge;

/**
 *  Sets the last modified date for the response using the "Last-Modified" header.
 *
 *  The default value is nil.
 */
@property(nonatomic, retain) NSDate* lastModifiedDate;

/**
 *  Sets the ETag for the response using the "ETag" header.
 *
 *  The default value is nil.
 */
@property(nonatomic, copy) NSString* eTag;

/**
 *  Enables gzip encoding for the response body.
 *
 *  The default value is NO.
 *
 *  @warning Enabling gzip encoding will remove any "Content-Length" header
 *  since the length of the body is not known anymore. The client will still
 *  be able to determine the body length when connection is closed per
 *  HTTP/1.1 specifications.
 */
@property(nonatomic, getter=isGZipContentEncodingEnabled) BOOL gzipContentEncodingEnabled;

/**
 *  Creates an empty response.
 */
+ (instancetype)response;

/**
 *  This method is the designated initializer for the class.
 */
- (instancetype)init;

/**
 *  Sets an additional HTTP header on the response.
 *  Pass a nil value to remove an additional header.
 *
 *  @warning Do not attempt to override the primary headers used
 *  by GCDWebServerResponse like "Content-Type", "ETag", etc...
 */
- (void)setValue:(NSString*)value forAdditionalHeader:(NSString*)header;

/**
 *  Convenience method that checks if the contentType property is defined.
 */
- (BOOL)hasBody;

@end

@interface GCDWebServerResponse (Extensions)

/**
 *  Creates a empty response with a specific HTTP status code.
 */
+ (instancetype)responseWithStatusCode:(NSInteger)statusCode;

/**
 *  Creates an HTTP redirect response to a new URL.
 */
+ (instancetype)responseWithRedirect:(NSURL*)location permanent:(BOOL)permanent;

/**
 *  Initializes an empty response with a specific HTTP status code.
 */
- (instancetype)initWithStatusCode:(NSInteger)statusCode;

/**
 *  Initializes an HTTP redirect response to a new URL.
 */
- (instancetype)initWithRedirect:(NSURL*)location permanent:(BOOL)permanent;

@end
