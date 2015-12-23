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

#import "GCDWebServer.h"

@class GCDWebUploader;

/**
 *  Delegate methods for GCDWebUploader.
 *
 *  @warning These methods are always called on the main thread in a serialized way.
 */
@protocol GCDWebUploaderDelegate <GCDWebServerDelegate>
@optional

/**
 *  This method is called whenever a file has been downloaded.
 */
- (void)webUploader:(GCDWebUploader*)uploader didDownloadFileAtPath:(NSString*)path;

/**
 *  This method is called whenever a file has been uploaded.
 */
- (void)webUploader:(GCDWebUploader*)uploader didUploadFileAtPath:(NSString*)path;

/**
 *  This method is called whenever a file or directory has been moved.
 */
- (void)webUploader:(GCDWebUploader*)uploader didMoveItemFromPath:(NSString*)fromPath toPath:(NSString*)toPath;

/**
 *  This method is called whenever a file or directory has been deleted.
 */
- (void)webUploader:(GCDWebUploader*)uploader didDeleteItemAtPath:(NSString*)path;

/**
 *  This method is called whenever a directory has been created.
 */
- (void)webUploader:(GCDWebUploader*)uploader didCreateDirectoryAtPath:(NSString*)path;

@end

/**
 *  The GCDWebUploader subclass of GCDWebServer implements an HTML 5 web browser
 *  interface for uploading or downloading files, and moving or deleting files
 *  or directories.
 *
 *  See the README.md file for more information about the features of GCDWebUploader.
 *
 *  @warning For GCDWebUploader to work, "GCDWebUploader.bundle" must be added
 *  to the resources of the Xcode target.
 */
@interface GCDWebUploader : GCDWebServer

/**
 *  Returns the upload directory as specified when the uploader was initialized.
 */
@property(nonatomic, readonly) NSString* uploadDirectory;

/**
 *  Sets the delegate for the uploader.
 */
@property(nonatomic, assign) id<GCDWebUploaderDelegate> delegate;

/**
 *  Sets which files are allowed to be operated on depending on their extension.
 *
 *  The default value is nil i.e. all file extensions are allowed.
 */
@property(nonatomic, copy) NSArray* allowedFileExtensions;

/**
 *  Sets if files and directories whose name start with a period are allowed to
 *  be operated on.
 *
 *  The default value is NO.
 */
@property(nonatomic) BOOL allowHiddenItems;

/**
 *  Sets the title for the uploader web interface.
 *
 *  The default value is the application name.
 *
 *  @warning Any reserved HTML characters in the string value for this property
 *  must have been replaced by character entities e.g. "&" becomes "&amp;".
 */
@property(nonatomic, copy) NSString* title;

/**
 *  Sets the header for the uploader web interface.
 *
 *  The default value is the same as the title property.
 *
 *  @warning Any reserved HTML characters in the string value for this property
 *  must have been replaced by character entities e.g. "&" becomes "&amp;".
 */
@property(nonatomic, copy) NSString* header;

/**
 *  Sets the prologue for the uploader web interface.
 *
 *  The default value is a short help text.
 *
 *  @warning The string value for this property must be raw HTML
 *  e.g. "<p>Some text</p>"
 */
@property(nonatomic, copy) NSString* prologue;

/**
 *  Sets the epilogue for the uploader web interface.
 *
 *  The default value is nil i.e. no epilogue.
 *
 *  @warning The string value for this property must be raw HTML
 *  e.g. "<p>Some text</p>"
 */
@property(nonatomic, copy) NSString* epilogue;

/**
 *  Sets the footer for the uploader web interface.
 *
 *  The default value is the application name and version.
 *
 *  @warning Any reserved HTML characters in the string value for this property
 *  must have been replaced by character entities e.g. "&" becomes "&amp;".
 */
@property(nonatomic, copy) NSString* footer;

/**
 *  This method is the designated initializer for the class.
 */
- (instancetype)initWithUploadDirectory:(NSString*)path;

@end

/**
 *  Hooks to customize the behavior of GCDWebUploader.
 *
 *  @warning These methods can be called on any GCD thread.
 */
@interface GCDWebUploader (Subclassing)

/**
 *  This method is called to check if a file upload is allowed to complete.
 *  The uploaded file is available for inspection at "tempPath".
 *
 *  The default implementation returns YES.
 */
- (BOOL)shouldUploadFileAtPath:(NSString*)path withTemporaryFile:(NSString*)tempPath;

/**
 *  This method is called to check if a file or directory is allowed to be moved.
 *
 *  The default implementation returns YES.
 */
- (BOOL)shouldMoveItemFromPath:(NSString*)fromPath toPath:(NSString*)toPath;

/**
 *  This method is called to check if a file or directory is allowed to be deleted.
 *
 *  The default implementation returns YES.
 */
- (BOOL)shouldDeleteItemAtPath:(NSString*)path;

/**
 *  This method is called to check if a directory is allowed to be created.
 *
 *  The default implementation returns YES.
 */
- (BOOL)shouldCreateDirectoryAtPath:(NSString*)path;

@end
