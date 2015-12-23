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
 *  Attribute key to retrieve an NSArray containing NSStrings from a GCDWebServerRequest
 *  with the contents of any regular expression captures done on the request path.
 *
 *  @warning This attribute will only be set on the request if adding a handler using 
 *  -addHandlerForMethod:pathRegex:requestClass:processBlock:.
 */
extern NSString* const GCDWebServerRequestAttribute_RegexCaptures;

/**
 *  This protocol is used by the GCDWebServerConnection to communicate with
 *  the GCDWebServerRequest and write the received HTTP body data.
 *
 *  Note that multiple GCDWebServerBodyWriter objects can be chained together
 *  internally e.g. to automatically decode gzip encoded content before
 *  passing it on to the GCDWebServerRequest.
 *
 *  @warning These methods can be called on any GCD thread.
 */
@protocol GCDWebServerBodyWriter <NSObject>

/**
 *  This method is called before any body data is received.
 *
 *  It should return YES on success or NO on failure and set the "error" argument
 *  which is guaranteed to be non-NULL.
 */
- (BOOL)open:(NSError**)error;

/**
 *  This method is called whenever body data has been received.
 *
 *  It should return YES on success or NO on failure and set the "error" argument
 *  which is guaranteed to be non-NULL.
 */
- (BOOL)writeData:(NSData*)data error:(NSError**)error;

/**
 *  This method is called after all body data has been received.
 *
 *  It should return YES on success or NO on failure and set the "error" argument
 *  which is guaranteed to be non-NULL.
 */
- (BOOL)close:(NSError**)error;

@end

/**
 *  The GCDWebServerRequest class is instantiated by the GCDWebServerConnection
 *  after the HTTP headers have been received. Each instance wraps a single HTTP
 *  request. If a body is present, the methods from the GCDWebServerBodyWriter
 *  protocol will be called by the GCDWebServerConnection to receive it.
 *
 *  The default implementation of the GCDWebServerBodyWriter protocol on the class
 *  simply ignores the body data.
 *
 *  @warning GCDWebServerRequest instances can be created and used on any GCD thread.
 */
@interface GCDWebServerRequest : NSObject <GCDWebServerBodyWriter>

/**
 *  Returns the HTTP method for the request.
 */
@property(nonatomic, readonly) NSString* method;

/**
 *  Returns the URL for the request.
 */
@property(nonatomic, readonly) NSURL* URL;

/**
 *  Returns the HTTP headers for the request.
 */
@property(nonatomic, readonly) NSDictionary* headers;

/**
 *  Returns the path component of the URL for the request.
 */
@property(nonatomic, readonly) NSString* path;

/**
 *  Returns the parsed and unescaped query component of the URL for the request.
 *
 *  @warning This property will be nil if there is no query in the URL.
 */
@property(nonatomic, readonly) NSDictionary* query;

/**
 *  Returns the content type for the body of the request parsed from the
 *  "Content-Type" header.
 *
 *  This property will be nil if the request has no body or set to
 *  "application/octet-stream" if a body is present but there was no
 *  "Content-Type" header.
 */
@property(nonatomic, readonly) NSString* contentType;

/**
 *  Returns the content length for the body of the request parsed from the
 *  "Content-Length" header.
 *
 *  This property will be set to "NSUIntegerMax" if the request has no body or
 *  if there is a body but no "Content-Length" header, typically because
 *  chunked transfer encoding is used.
 */
@property(nonatomic, readonly) NSUInteger contentLength;

/**
 *  Returns the parsed "If-Modified-Since" header or nil if absent or malformed.
 */
@property(nonatomic, readonly) NSDate* ifModifiedSince;

/**
 *  Returns the parsed "If-None-Match" header or nil if absent or malformed.
 */
@property(nonatomic, readonly) NSString* ifNoneMatch;

/**
 *  Returns the parsed "Range" header or (NSUIntegerMax, 0) if absent or malformed.
 *  The range will be set to (offset, length) if expressed from the beginning
 *  of the entity body, or (NSUIntegerMax, length) if expressed from its end.
 */
@property(nonatomic, readonly) NSRange byteRange;

/**
 *  Returns YES if the client supports gzip content encoding according to the
 *  "Accept-Encoding" header.
 */
@property(nonatomic, readonly) BOOL acceptsGzipContentEncoding;

/**
 *  Returns the address of the local peer (i.e. server) for the request
 *  as a raw "struct sockaddr".
 */
@property(nonatomic, readonly) NSData* localAddressData;

/**
 *  Returns the address of the local peer (i.e. server) for the request
 *  as a string.
 */
@property(nonatomic, readonly) NSString* localAddressString;

/**
 *  Returns the address of the remote peer (i.e. client) for the request
 *  as a raw "struct sockaddr".
 */
@property(nonatomic, readonly) NSData* remoteAddressData;

/**
 *  Returns the address of the remote peer (i.e. client) for the request
 *  as a string.
 */
@property(nonatomic, readonly) NSString* remoteAddressString;

/**
 *  This method is the designated initializer for the class.
 */
- (instancetype)initWithMethod:(NSString*)method url:(NSURL*)url headers:(NSDictionary*)headers path:(NSString*)path query:(NSDictionary*)query;

/**
 *  Convenience method that checks if the contentType property is defined.
 */
- (BOOL)hasBody;

/**
 *  Convenience method that checks if the byteRange property is defined.
 */
- (BOOL)hasByteRange;

/**
 *  Retrieves an attribute associated with this request using the given key.
 *
 *  @return The attribute value for the key.
 */
- (id)attributeForKey:(NSString*)key;

@end
