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

@implementation GCDWebServerFileRequest {
  int _file;
}

- (instancetype)initWithMethod:(NSString*)method url:(NSURL*)url headers:(NSDictionary*)headers path:(NSString*)path query:(NSDictionary*)query {
  if ((self = [super initWithMethod:method url:url headers:headers path:path query:query])) {
    _temporaryPath = [NSTemporaryDirectory() stringByAppendingPathComponent:[[NSProcessInfo processInfo] globallyUniqueString]];
  }
  return self;
}

- (void)dealloc {
  unlink([_temporaryPath fileSystemRepresentation]);
}

- (BOOL)open:(NSError**)error {
  _file = open([_temporaryPath fileSystemRepresentation], O_CREAT | O_TRUNC | O_WRONLY, S_IRUSR | S_IWUSR | S_IRGRP | S_IROTH);
  if (_file <= 0) {
    if (error) {
      *error = GCDWebServerMakePosixError(errno);
    }
    return NO;
  }
  return YES;
}

- (BOOL)writeData:(NSData*)data error:(NSError**)error {
  if (write(_file, data.bytes, data.length) != (ssize_t)data.length) {
    if (error) {
      *error = GCDWebServerMakePosixError(errno);
    }
    return NO;
  }
  return YES;
}

- (BOOL)close:(NSError**)error {
  if (close(_file) < 0) {
    if (error) {
      *error = GCDWebServerMakePosixError(errno);
    }
    return NO;
  }
#ifdef __GCDWEBSERVER_ENABLE_TESTING__
  NSString* creationDateHeader = [self.headers objectForKey:@"X-GCDWebServer-CreationDate"];
  if (creationDateHeader) {
    NSDate* date = GCDWebServerParseISO8601(creationDateHeader);
    if (!date || ![[NSFileManager defaultManager] setAttributes:@{NSFileCreationDate : date} ofItemAtPath:_temporaryPath error:error]) {
      return NO;
    }
  }
  NSString* modifiedDateHeader = [self.headers objectForKey:@"X-GCDWebServer-ModifiedDate"];
  if (modifiedDateHeader) {
    NSDate* date = GCDWebServerParseRFC822(modifiedDateHeader);
    if (!date || ![[NSFileManager defaultManager] setAttributes:@{NSFileModificationDate : date} ofItemAtPath:_temporaryPath error:error]) {
      return NO;
    }
  }
#endif
  return YES;
}

- (NSString*)description {
  NSMutableString* description = [NSMutableString stringWithString:[super description]];
  [description appendFormat:@"\n\n{%@}", _temporaryPath];
  return description;
}

@end
