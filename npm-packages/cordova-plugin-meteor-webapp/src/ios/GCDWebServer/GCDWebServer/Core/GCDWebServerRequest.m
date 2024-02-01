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
@end

@interface GCDWebServerGZipDecoder : GCDWebServerBodyDecoder
@end

@implementation GCDWebServerBodyDecoder {
  GCDWebServerRequest* __unsafe_unretained _request;
  id<GCDWebServerBodyWriter> __unsafe_unretained _writer;
}

- (instancetype)initWithRequest:(GCDWebServerRequest* _Nonnull)request writer:(id<GCDWebServerBodyWriter> _Nonnull)writer {
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

@implementation GCDWebServerGZipDecoder {
  z_stream _stream;
  BOOL _finished;
}

- (BOOL)open:(NSError**)error {
  int result = inflateInit2(&_stream, 15 + 16);
  if (result != Z_OK) {
    if (error) {
      *error = [NSError errorWithDomain:kZlibErrorDomain code:result userInfo:nil];
    }
    return NO;
  }
  if (![super open:error]) {
    inflateEnd(&_stream);
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

@implementation GCDWebServerRequest {
  BOOL _opened;
  NSMutableArray* _decoders;
  id<GCDWebServerBodyWriter> __unsafe_unretained _writer;
  NSMutableDictionary* _attributes;
}

- (instancetype)initWithMethod:(NSString*)method url:(NSURL*)url headers:(NSDictionary*)headers path:(NSString*)path query:(NSDictionary*)query {
  if ((self = [super init])) {
    _method = [method copy];
    _URL = url;
    _headers = headers;
    _path = [path copy];
    _query = query;

    _contentType = GCDWebServerNormalizeHeaderValue([_headers objectForKey:@"Content-Type"]);
    _usesChunkedTransferEncoding = [GCDWebServerNormalizeHeaderValue([_headers objectForKey:@"Transfer-Encoding"]) isEqualToString:@"chunked"];
    NSString* lengthHeader = [_headers objectForKey:@"Content-Length"];
    if (lengthHeader) {
      NSInteger length = [lengthHeader integerValue];
      if (_usesChunkedTransferEncoding || (length < 0)) {
        GWS_LOG_WARNING(@"Invalid 'Content-Length' header '%@' for '%@' request on \"%@\"", lengthHeader, _method, _URL);
        GWS_DNOT_REACHED();
        return nil;
      }
      _contentLength = length;
      if (_contentType == nil) {
        _contentType = kGCDWebServerDefaultMimeType;
      }
    } else if (_usesChunkedTransferEncoding) {
      if (_contentType == nil) {
        _contentType = kGCDWebServerDefaultMimeType;
      }
      _contentLength = NSUIntegerMax;
    } else {
      if (_contentType) {
        GWS_LOG_WARNING(@"Ignoring 'Content-Type' header for '%@' request on \"%@\"", _method, _URL);
        _contentType = nil;  // Content-Type without Content-Length or chunked-encoding doesn't make sense
      }
      _contentLength = NSUIntegerMax;
    }

    NSString* modifiedHeader = [_headers objectForKey:@"If-Modified-Since"];
    if (modifiedHeader) {
      _ifModifiedSince = [GCDWebServerParseRFC822(modifiedHeader) copy];
    }
    _ifNoneMatch = [_headers objectForKey:@"If-None-Match"];

    _byteRange = NSMakeRange(NSUIntegerMax, 0);
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
              _byteRange.location = startValue;
              _byteRange.length = endValue - startValue + 1;
            } else if (startString.length && (startValue >= 0)) {  // The bytes after 9500 bytes: "9500-"
              _byteRange.location = startValue;
              _byteRange.length = NSUIntegerMax;
            } else if (endString.length && (endValue > 0)) {  // The final 500 bytes: "-500"
              _byteRange.location = NSUIntegerMax;
              _byteRange.length = endValue;
            }
          }
        }
      }
      if ((_byteRange.location == NSUIntegerMax) && (_byteRange.length == 0)) {  // Ignore "Range" header if syntactically invalid
        GWS_LOG_WARNING(@"Failed to parse 'Range' header \"%@\" for url: %@", rangeHeader, url);
      }
    }

    if ([[_headers objectForKey:@"Accept-Encoding"] rangeOfString:@"gzip"].location != NSNotFound) {
      _acceptsGzipContentEncoding = YES;
    }

    _decoders = [[NSMutableArray alloc] init];
    _attributes = [[NSMutableDictionary alloc] init];
  }
  return self;
}

- (BOOL)hasBody {
  return _contentType ? YES : NO;
}

- (BOOL)hasByteRange {
  return GCDWebServerIsValidByteRange(_byteRange);
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
  GWS_DCHECK(_contentType);
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
  return GCDWebServerStringFromSockAddr(_localAddressData.bytes, YES);
}

- (NSString*)remoteAddressString {
  return GCDWebServerStringFromSockAddr(_remoteAddressData.bytes, YES);
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
