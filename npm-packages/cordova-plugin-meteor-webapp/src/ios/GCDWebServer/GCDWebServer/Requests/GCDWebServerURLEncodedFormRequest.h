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

#import "GCDWebServerDataRequest.h"

NS_ASSUME_NONNULL_BEGIN

/**
 *  The GCDWebServerURLEncodedFormRequest subclass of GCDWebServerRequest
 *  parses the body of the HTTP request as a URL encoded form using
 *  GCDWebServerParseURLEncodedForm().
 */
@interface GCDWebServerURLEncodedFormRequest : GCDWebServerDataRequest

/**
 *  Returns the unescaped control names and values for the URL encoded form.
 *
 *  The text encoding used to interpret the data is extracted from the
 *  "Content-Type" header or defaults to UTF-8.
 */
@property(nonatomic, readonly) NSDictionary* arguments;

/**
 *  Returns the MIME type for URL encoded forms
 *  i.e. "application/x-www-form-urlencoded".
 */
+ (NSString*)mimeType;

@end

NS_ASSUME_NONNULL_END
