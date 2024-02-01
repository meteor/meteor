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

NS_ASSUME_NONNULL_BEGIN

@class GCDWebDAVServer;

/**
 *  Delegate methods for GCDWebDAVServer.
 *
 *  @warning These methods are always called on the main thread in a serialized way.
 */
@protocol GCDWebDAVServerDelegate <GCDWebServerDelegate>
@optional

/**
 *  This method is called whenever a file has been downloaded.
 */
- (void)davServer:(GCDWebDAVServer*)server didDownloadFileAtPath:(NSString*)path;

/**
 *  This method is called whenever a file has been uploaded.
 */
- (void)davServer:(GCDWebDAVServer*)server didUploadFileAtPath:(NSString*)path;

/**
 *  This method is called whenever a file or directory has been moved.
 */
- (void)davServer:(GCDWebDAVServer*)server didMoveItemFromPath:(NSString*)fromPath toPath:(NSString*)toPath;

/**
 *  This method is called whenever a file or directory has been copied.
 */
- (void)davServer:(GCDWebDAVServer*)server didCopyItemFromPath:(NSString*)fromPath toPath:(NSString*)toPath;

/**
 *  This method is called whenever a file or directory has been deleted.
 */
- (void)davServer:(GCDWebDAVServer*)server didDeleteItemAtPath:(NSString*)path;

/**
 *  This method is called whenever a directory has been created.
 */
- (void)davServer:(GCDWebDAVServer*)server didCreateDirectoryAtPath:(NSString*)path;

@end

/**
 *  The GCDWebDAVServer subclass of GCDWebServer implements a class 1 compliant
 *  WebDAV server. It is also partially class 2 compliant but only when the
 *  client is the OS X WebDAV implementation (so it can work with the OS X Finder).
 *
 *  See the README.md file for more information about the features of GCDWebDAVServer.
 */
@interface GCDWebDAVServer : GCDWebServer

/**
 *  Returns the upload directory as specified when the server was initialized.
 */
@property(nonatomic, readonly) NSString* uploadDirectory;

/**
 *  Sets the delegate for the server.
 */
@property(nonatomic, weak, nullable) id<GCDWebDAVServerDelegate> delegate;

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
 *  This method is the designated initializer for the class.
 */
- (instancetype)initWithUploadDirectory:(NSString*)path;

@end

/**
 *  Hooks to customize the behavior of GCDWebDAVServer.
 *
 *  @warning These methods can be called on any GCD thread.
 */
@interface GCDWebDAVServer (Subclassing)

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
 *  This method is called to check if a file or directory is allowed to be copied.
 *
 *  The default implementation returns YES.
 */
- (BOOL)shouldCopyItemFromPath:(NSString*)fromPath toPath:(NSString*)toPath;

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

NS_ASSUME_NONNULL_END
