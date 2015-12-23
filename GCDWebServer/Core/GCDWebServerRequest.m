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

#import <zlib.h>

#import "GCDWebServerPrivate.h"

NSString* const GCDWebServerRequestAttribute_RegexCaptures = @"GCDWebServerRequestAttribute_RegexCaptures";

#define kZlibErrorDomain @"ZlibErrorDomain"
#define kGZipInitialBufferSize (256 * 1024)

@interface GCDWebServerBodyDecoder : NSObject <GCDWebServerBodyWriter>
- (id)initWithRequest:(GCDWebServerRequest*)request writer:(id<GCDWebServerBodyWriter>)writer;
@end

@interface GCDWebServerGZipDecoder : GCDWebServerBodyDecoder
@end

@interface GCDWebServerBodyDecoder () {
@private
  GCDWebServerRequest* __unsafe_unretained _request;
  id<GCDWebServerBodyWriter> __unsafe_unretained _writer;
}
@end

@implementation GCDWebServerBodyDecoder

- (id)initWithRequest:(GCDWebServerRequest*)request writer:(id<GCDWebServerBodyWriter>)writer {
  if ((self = [super init])) {
    _request = request;
    _writer = writer;
  }
  return self;
}

- (BOOL)open:(NSError**)error {
  return [_writer open:error];
}

- (BOOL)writeData:(NSData*)data error:(NSError**)error {
  return [_writer writeData:data error:error];
}

- (BOOL)close:(NSError**)error {
  return [_writer close:error];
}

@end

@interface GCDWebServerGZipDecoder () {
@private
  z_stream _stream;
  BOOL _finished;
}
@end

@implementation GCDWebServerGZipDecoder

- (BOOL)open:(NSError**)error {
  int result = inflateInit2(&_stream, 15 + 16);
  if (result != Z_OK) {
    if (error) {
      *error = [NSError errorWithDomain:kZlibErrorDomain code:result userInfo:nil];
    }
    return NO;
  }
  if (![super open:error]) {
    deflateEnd(&_stream);
    return NO;
  }
  return YES;
}

- (BOOL)writeData:(NSData*)data error:(NSError**)error {
  GWS_DCHECK(!_finished);
  _stream.next_in = (Bytef*)data.bytes;
  _stream.avail_in = (uInt)data.length;
  NSMutableData* decodedData = [[NSMutableData alloc] initWithLength:kGZipInitialBufferSize];
  if (decodedData == nil) {
    GWS_DNOT_REACHED();
    return NO;
  }
  NSUInteger length = 0;
  while (1) {
    NSUInteger maxLength = decodedData.length - length;
    _stream.next_out = (Bytef*)((char*)decodedData.mutableBytes + length);
    _stream.avail_out = (uInt)maxLength;
    int result = inflate(&_stream, Z_NO_FLUSH);
    if ((result != Z_OK) && (result != Z_STREAM_END)) {
      if (error) {
        *error = [NSError errorWithDomain:kZlibErrorDomain code:result userInfo:nil];
      }
      return NO;
    }
    length += maxLength - _stream.avail_out;
    if (_stream.avail_out > 0) {
      if (result == Z_STREAM_END) {
        _finished = YES;
      }
      break;
    }
    decodedData.length = 2 * decodedData.length;  // zlib has used all the output buffer so resize it and try again in case more data is available
  }
  decodedData.length = length;
  BOOL success = length ? [super writeData:decodedData error:error] : YES;  // No need to call writer if we have no data yet
  return success;
}

- (BOOL)close:(NSError**)error {
  GWS_DCHECK(_finished);
  inflateEnd(&_stream);
  return [super close:error];
}

@end

@interface GCDWebServerRequest () {
@private
  NSString* _method;
  NSURL* _url;
  NSDictionary* _headers;
  NSString* _path;
  NSDictionary* _query;
  NSString* _type;
  BOOL _chunked;
  NSUInteger _length;
  NSDate* _modifiedSince;
  NSString* _noneMatch;
  NSRange _range;
  BOOL _gzipAccepted;
  NSData* _localAddress;
  NSData* _remoteAddress;
  
  BOOL _opened;
  NSMutableArray* _decoders;
  NSMutableDictionary* _attributes;
  id<GCDWebServerBodyWriter> __unsafe_unretained _writer;
}
@end

@implementation GCDWebServerRequest : NSObject

@synthesize method=_method, URL=_url, headers=_headers, path=_path, query=_query, contentType=_type, contentLength=_length, ifModifiedSince=_modifiedSince, ifNoneMatch=_noneMatch,
            byteRange=_range, acceptsGzipContentEncoding=_gzipAccepted, usesChunkedTransferEncoding=_chunked, localAddressData=_localAddress, remoteAddressData=_remoteAddress;

- (instancetype)initWithMethod:(NSString*)method url:(NSURL*)url headers:(NSDictionary*)headers path:(NSString*)path query:(NSDictionary*)query {
  if ((self = [super init])) {
    _method = [method copy];
    _url = url;
    _headers = headers;
    _path = [path copy];
    _query = query;
    
    _type = GCDWebServerNormalizeHeaderValue([_headers objectForKey:@"Content-Type"]);
    _chunked = [GCDWebServerNormalizeHeaderValue([_headers objectForKey:@"Transfer-Encoding"]) isEqualToString:@"chunked"];
    NSString* lengthHeader = [_headers objectForKey:@"Content-Length"];
    if (lengthHeader) {
      NSInteger length = [lengthHeader integerValue];
      if (_chunked || (length < 0)) {
        GWS_LOG_WARNING(@"Invalid 'Content-Length' header '%@' for '%@' request on \"%@\"", lengthHeader, _method, _url);
        GWS_DNOT_REACHED();
        return nil;
      }
      _length = length;
      if (_type == nil) {
        _type = kGCDWebServerDefaultMimeType;
      }
    } else if (_chunked) {
      if (_type == nil) {
        _type = kGCDWebServerDefaultMimeType;
      }
      _length = NSUIntegerMax;
    } else {
      if (_type) {
        GWS_LOG_WARNING(@"Ignoring 'Content-Type' header for '%@' request on \"%@\"", _method, _url);
        _type = nil;  // Content-Type without Content-Length or chunked-encoding doesn't make sense
      }
      _length = NSUIntegerMax;
    }
    
    NSString* modifiedHeader = [_headers objectForKey:@"If-Modified-Since"];
    if (modifiedHeader) {
      _modifiedSince = [GCDWebServerParseRFC822(modifiedHeader) copy];
    }
    _noneMatch = [_headers objectForKey:@"If-None-Match"];
    
    _range = NSMakeRange(NSUIntegerMax, 0);
    NSString* rangeHeader = GCDWebServerNormalizeHeaderValue([_headers objectForKey:@"Range"]);
    if (rangeHeader) {
      if ([rangeHeader hasPrefix:@"bytes="]) {
        NSArray* components = [[rangeHeader substringFromIndex:6] componentsSeparatedByString:@","];
        if (components.count == 1) {
          components = [[components firstObject] componentsSeparatedByString:@"-"];
          if (components.count == 2) {
            NSString* startString = [components objectAtIndex:0];
            NSInteger startValue = [startString integerValue];
            NSString* endString = [components objectAtIndex:1];
            NSInteger endValue = [endString integerValue];
            if (startString.length && (startValue >= 0) && endString.length && (endValue >= startValue)) {  // The second 500 bytes: "500-999"
              _range.location = startValue;
              _range.length = endValue - startValue + 1;
            } else if (startString.length && (startValue >= 0)) {  // The bytes after 9500 bytes: "9500-"
              _range.location = startValue;
              _range.length = NSUIntegerMax;
            } else if (endString.length && (endValue > 0)) {  // The final 500 bytes: "-500"
              _range.location = NSUIntegerMax;
              _range.length = endValue;
            }
          }
        }
      }
      if ((_range.location == NSUIntegerMax) && (_range.length == 0)) {  // Ignore "Range" header if syntactically invalid
        GWS_LOG_WARNING(@"Failed to parse 'Range' header \"%@\" for url: %@", rangeHeader, url);
      }
    }
    
    if ([[_headers objectForKey:@"Accept-Encoding"] rangeOfString:@"gzip"].location != NSNotFound) {
      _gzipAccepted = YES;
    }
    
    _decoders = [[NSMutableArray alloc] init];
    _attributes = [[NSMutableDictionary alloc] init];
  }
  return self;
}

- (BOOL)hasBody {
  return _type ? YES : NO;
}

- (BOOL)hasByteRange {
  return GCDWebServerIsValidByteRange(_range);
}

- (id)attributeForKey:(NSString*)key {
  return [_attributes objectForKey:key];
}

- (BOOL)open:(NSError**)error {
  return YES;
}

- (BOOL)writeData:(NSData*)data error:(NSError**)error {
  return YES;
}

- (BOOL)close:(NSError**)error {
  return YES;
}

- (void)prepareForWriting {
  _writer = self;
  if ([GCDWebServerNormalizeHeaderValue([self.headers objectForKey:@"Content-Encoding"]) isEqualToString:@"gzip"]) {
    GCDWebServerGZipDecoder* decoder = [[GCDWebServerGZipDecoder alloc] initWithRequest:self writer:_writer];
    [_decoders addObject:decoder];
    _writer = decoder;
  }
}

- (BOOL)performOpen:(NSError**)error {
  GWS_DCHECK(_type);
  GWS_DCHECK(_writer);
  if (_opened) {
    GWS_DNOT_REACHED();
    return NO;
  }
  _opened = YES;
  return [_writer open:error];
}

- (BOOL)performWriteData:(NSData*)data error:(NSError**)error {
  GWS_DCHECK(_opened);
  return [_writer writeData:data error:error];
}

- (BOOL)performClose:(NSError**)error {
  GWS_DCHECK(_opened);
  return [_writer close:error];
}

- (void)setAttribute:(id)attribute forKey:(NSString*)key {
  [_attributes setValue:attribute forKey:key];
}

- (NSString*)localAddressString {
  return GCDWebServerStringFromSockAddr(_localAddress.bytes, YES);
}

- (NSString*)remoteAddressString {
  return GCDWebServerStringFromSockAddr(_remoteAddress.bytes, YES);
}

- (NSString*)description {
  NSMutableString* description = [NSMutableString stringWithFormat:@"%@ %@", _method, _path];
  for (NSString* argument in [[_query allKeys] sortedArrayUsingSelector:@selector(compare:)]) {
    [description appendFormat:@"\n  %@ = %@", argument, [_query objectForKey:argument]];
  }
  [description appendString:@"\n"];
  for (NSString* header in [[_headers allKeys] sortedArrayUsingSelector:@selector(compare:)]) {
    [description appendFormat:@"\n%@: %@", header, [_headers objectForKey:header]];
  }
  return description;
}

@end
