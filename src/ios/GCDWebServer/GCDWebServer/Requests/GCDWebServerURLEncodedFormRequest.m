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

@interface GCDWebServerURLEncodedFormRequest () {
@private
  NSDictionary* _arguments;
}
@end

@implementation GCDWebServerURLEncodedFormRequest

@synthesize arguments=_arguments;

+ (NSString*)mimeType {
  return @"application/x-www-form-urlencoded";
}

- (BOOL)close:(NSError**)error {
  if (![super close:error]) {
    return NO;
  }
  
  NSString* charset = GCDWebServerExtractHeaderValueParameter(self.contentType, @"charset");
  NSString* string = [[NSString alloc] initWithData:self.data encoding:GCDWebServerStringEncodingFromCharset(charset)];
  _arguments = GCDWebServerParseURLEncodedForm(string);
  GWS_DCHECK(_arguments);
  
  return YES;
}

- (NSString*)description {
  NSMutableString* description = [NSMutableString stringWithString:[super description]];
  [description appendString:@"\n"];
  for (NSString* argument in [[_arguments allKeys] sortedArrayUsingSelector:@selector(compare:)]) {
    [description appendFormat:@"\n%@ = %@", argument, [_arguments objectForKey:argument]];
  }
  return description;
}

@end
