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

@implementation GCDWebServerStreamedResponse {
  GCDWebServerAsyncStreamBlock _block;
}

@dynamic contentType;

+ (instancetype)responseWithContentType:(NSString*)type streamBlock:(GCDWebServerStreamBlock)block {
  return [[[self class] alloc] initWithContentType:type streamBlock:block];
}

+ (instancetype)responseWithContentType:(NSString*)type asyncStreamBlock:(GCDWebServerAsyncStreamBlock)block {
  return [[[self class] alloc] initWithContentType:type asyncStreamBlock:block];
}

- (instancetype)initWithContentType:(NSString*)type streamBlock:(GCDWebServerStreamBlock)block {
  return [self initWithContentType:type
                  asyncStreamBlock:^(GCDWebServerBodyReaderCompletionBlock completionBlock) {

                    NSError* error = nil;
                    NSData* data = block(&error);
                    completionBlock(data, error);

                  }];
}

- (instancetype)initWithContentType:(NSString*)type asyncStreamBlock:(GCDWebServerAsyncStreamBlock)block {
  if ((self = [super init])) {
    _block = [block copy];

    self.contentType = type;
  }
  return self;
}

- (void)asyncReadDataWithCompletion:(GCDWebServerBodyReaderCompletionBlock)block {
  _block(block);
}

- (NSString*)description {
  NSMutableString* description = [NSMutableString stringWithString:[super description]];
  [description appendString:@"\n\n<STREAM>"];
  return description;
}

@end
