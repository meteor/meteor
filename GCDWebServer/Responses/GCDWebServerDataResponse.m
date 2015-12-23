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

#import "GCDWebServerPrivate.h"

@interface GCDWebServerDataResponse () {
@private
  NSData* _data;
  BOOL _done;
}
@end

@implementation GCDWebServerDataResponse

+ (instancetype)responseWithData:(NSData*)data contentType:(NSString*)type {
  return [[[self class] alloc] initWithData:data contentType:type];
}

- (instancetype)initWithData:(NSData*)data contentType:(NSString*)type {
  if (data == nil) {
    GWS_DNOT_REACHED();
    return nil;
  }
  
  if ((self = [super init])) {
    _data = data;
    
    self.contentType = type;
    self.contentLength = data.length;
  }
  return self;
}

- (NSData*)readData:(NSError**)error {
  NSData* data;
  if (_done) {
    data = [NSData data];
  } else {
    data = _data;
    _done = YES;
  }
  return data;
}

- (NSString*)description {
  NSMutableString* description = [NSMutableString stringWithString:[super description]];
  [description appendString:@"\n\n"];
  [description appendString:GCDWebServerDescribeData(_data, self.contentType)];
  return description;
}

@end

@implementation GCDWebServerDataResponse (Extensions)

+ (instancetype)responseWithText:(NSString*)text {
  return [[self alloc] initWithText:text];
}

+ (instancetype)responseWithHTML:(NSString*)html {
  return [[self alloc] initWithHTML:html];
}

+ (instancetype)responseWithHTMLTemplate:(NSString*)path variables:(NSDictionary*)variables {
  return [[self alloc] initWithHTMLTemplate:path variables:variables];
}

+ (instancetype)responseWithJSONObject:(id)object {
  return [[self alloc] initWithJSONObject:object];
}

+ (instancetype)responseWithJSONObject:(id)object contentType:(NSString*)type {
  return [[self alloc] initWithJSONObject:object contentType:type];
}

- (instancetype)initWithText:(NSString*)text {
  NSData* data = [text dataUsingEncoding:NSUTF8StringEncoding];
  if (data == nil) {
    GWS_DNOT_REACHED();
    return nil;
  }
  return [self initWithData:data contentType:@"text/plain; charset=utf-8"];
}

- (instancetype)initWithHTML:(NSString*)html {
  NSData* data = [html dataUsingEncoding:NSUTF8StringEncoding];
  if (data == nil) {
    GWS_DNOT_REACHED();
    return nil;
  }
  return [self initWithData:data contentType:@"text/html; charset=utf-8"];
}

- (instancetype)initWithHTMLTemplate:(NSString*)path variables:(NSDictionary*)variables {
  NSMutableString* html = [[NSMutableString alloc] initWithContentsOfFile:path encoding:NSUTF8StringEncoding error:NULL];
  [variables enumerateKeysAndObjectsUsingBlock:^(NSString* key, NSString* value, BOOL* stop) {
    [html replaceOccurrencesOfString:[NSString stringWithFormat:@"%%%@%%", key] withString:value options:0 range:NSMakeRange(0, html.length)];
  }];
  id response = [self initWithHTML:html];
  return response;
}

- (instancetype)initWithJSONObject:(id)object {
  return [self initWithJSONObject:object contentType:@"application/json"];
}

- (instancetype)initWithJSONObject:(id)object contentType:(NSString*)type {
  NSData* data = [NSJSONSerialization dataWithJSONObject:object options:0 error:NULL];
  if (data == nil) {
    return nil;
  }
  return [self initWithData:data contentType:type];
}

@end
