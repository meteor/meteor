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

#import "ViewController.h"
#import "GCDWebUploader.h"

@interface ViewController () <GCDWebUploaderDelegate>
@property(weak, nonatomic) IBOutlet UILabel* label;
@end

@implementation ViewController {
@private
  GCDWebUploader* _webServer;
}

- (void)viewWillAppear:(BOOL)animated {
  [super viewWillAppear:animated];
  
  NSString* documentsPath = [NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES) firstObject];
  _webServer = [[GCDWebUploader alloc] initWithUploadDirectory:documentsPath];
  _webServer.delegate = self;
  _webServer.allowHiddenItems = YES;
  if ([_webServer start]) {
    _label.text = [NSString stringWithFormat:NSLocalizedString(@"GCDWebServer running locally on port %i", nil), (int)_webServer.port];
  } else {
    _label.text = NSLocalizedString(@"GCDWebServer not running!", nil);
  }
}

- (void)viewDidDisappear:(BOOL)animated {
  [super viewDidDisappear:animated];
  
  [_webServer stop];
  _webServer = nil;
}

- (void)webUploader:(GCDWebUploader*)uploader didUploadFileAtPath:(NSString*)path {
  NSLog(@"[UPLOAD] %@", path);
}

- (void)webUploader:(GCDWebUploader*)uploader didMoveItemFromPath:(NSString*)fromPath toPath:(NSString*)toPath {
  NSLog(@"[MOVE] %@ -> %@", fromPath, toPath);
}

- (void)webUploader:(GCDWebUploader*)uploader didDeleteItemAtPath:(NSString*)path {
  NSLog(@"[DELETE] %@", path);
}

- (void)webUploader:(GCDWebUploader*)uploader didCreateDirectoryAtPath:(NSString*)path {
  NSLog(@"[CREATE] %@", path);
}

@end
