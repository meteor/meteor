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

#import "GCDWebServerResponse.h"

/**
 *  The GCDWebServerDataResponse subclass of GCDWebServerResponse reads the body
 *  of the HTTP response from memory.
 */
@interface GCDWebServerDataResponse : GCDWebServerResponse

/**
 *  Creates a response with data in memory and a given content type.
 */
+ (instancetype)responseWithData:(NSData*)data contentType:(NSString*)type;

/**
 *  This method is the designated initializer for the class.
 */
- (instancetype)initWithData:(NSData*)data contentType:(NSString*)type;

@end

@interface GCDWebServerDataResponse (Extensions)

/**
 *  Creates a data response from text encoded using UTF-8.
 */
+ (instancetype)responseWithText:(NSString*)text;

/**
 *  Creates a data response from HTML encoded using UTF-8.
 */
+ (instancetype)responseWithHTML:(NSString*)html;

/**
 *  Creates a data response from an HTML template encoded using UTF-8.
 *  See -initWithHTMLTemplate:variables: for details.
 */
+ (instancetype)responseWithHTMLTemplate:(NSString*)path variables:(NSDictionary*)variables;

/**
 *  Creates a data response from a serialized JSON object and the default
 *  "application/json" content type.
 */
+ (instancetype)responseWithJSONObject:(id)object;

/**
 *  Creates a data response from a serialized JSON object and a custom
 *  content type.
 */
+ (instancetype)responseWithJSONObject:(id)object contentType:(NSString*)type;

/**
 *  Initializes a data response from text encoded using UTF-8.
 */
- (instancetype)initWithText:(NSString*)text;

/**
 *  Initializes a data response from HTML encoded using UTF-8.
 */
- (instancetype)initWithHTML:(NSString*)html;

/**
 *  Initializes a data response from an HTML template encoded using UTF-8.
 *
 *  All occurences of "%variable%" within the HTML template are replaced with
 *  their corresponding values.
 */
- (instancetype)initWithHTMLTemplate:(NSString*)path variables:(NSDictionary*)variables;

/**
 *  Initializes a data response from a serialized JSON object and the default
 *  "application/json" content type.
 */
- (instancetype)initWithJSONObject:(id)object;

/**
 *  Initializes a data response from a serialized JSON object and a custom
 *  content type.
 */
- (instancetype)initWithJSONObject:(id)object contentType:(NSString*)type;

@end
