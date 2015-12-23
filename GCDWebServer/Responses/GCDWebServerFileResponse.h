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
 *  The GCDWebServerFileResponse subclass of GCDWebServerResponse reads the body
 *  of the HTTP response from a file on disk.
 *
 *  It will automatically set the contentType, lastModifiedDate and eTag
 *  properties of the GCDWebServerResponse according to the file extension and
 *  metadata.
 */
@interface GCDWebServerFileResponse : GCDWebServerResponse

/**
 *  Creates a response with the contents of a file.
 */
+ (instancetype)responseWithFile:(NSString*)path;

/**
 *  Creates a response like +responseWithFile: and sets the "Content-Disposition"
 *  HTTP header for a download if the "attachment" argument is YES.
 */
+ (instancetype)responseWithFile:(NSString*)path isAttachment:(BOOL)attachment;

/**
 *  Creates a response like +responseWithFile: but restricts the file contents
 *  to a specific byte range.
 *
 *  See -initWithFile:byteRange: for details.
 */
+ (instancetype)responseWithFile:(NSString*)path byteRange:(NSRange)range;

/**
 *  Creates a response like +responseWithFile:byteRange: and sets the
 *  "Content-Disposition" HTTP header for a download if the "attachment"
 *  argument is YES.
 */
+ (instancetype)responseWithFile:(NSString*)path byteRange:(NSRange)range isAttachment:(BOOL)attachment;

/**
 *  Initializes a response with the contents of a file.
 */
- (instancetype)initWithFile:(NSString*)path;

/**
 *  Initializes a response like +responseWithFile: and sets the
 *  "Content-Disposition" HTTP header for a download if the "attachment"
 *  argument is YES.
 */
- (instancetype)initWithFile:(NSString*)path isAttachment:(BOOL)attachment;

/**
 *  Initializes a response like -initWithFile: but restricts the file contents
 *  to a specific byte range. This range should be set to (NSUIntegerMax, 0) for
 *  the full file, (offset, length) if expressed from the beginning of the file,
 *  or (NSUIntegerMax, length) if expressed from the end of the file. The "offset"
 *  and "length" values will be automatically adjusted to be compatible with the
 *  actual size of the file.
 *
 *  This argument would typically be set to the value of the byteRange property
 *  of the current GCDWebServerRequest.
 */
- (instancetype)initWithFile:(NSString*)path byteRange:(NSRange)range;

/**
 *  This method is the designated initializer for the class.
 */
- (instancetype)initWithFile:(NSString*)path byteRange:(NSRange)range isAttachment:(BOOL)attachment;

@end
