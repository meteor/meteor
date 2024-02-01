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

// http://www.w3.org/Protocols/rfc2616/rfc2616-sec10.html
// http://www.iana.org/assignments/http-status-codes/http-status-codes.xhtml

#import <Foundation/Foundation.h>

/**
 *  Convenience constants for "informational" HTTP status codes.
 */
typedef NS_ENUM(NSInteger, GCDWebServerInformationalHTTPStatusCode) {
  kGCDWebServerHTTPStatusCode_Continue = 100,
  kGCDWebServerHTTPStatusCode_SwitchingProtocols = 101,
  kGCDWebServerHTTPStatusCode_Processing = 102
};

/**
 *  Convenience constants for "successful" HTTP status codes.
 */
typedef NS_ENUM(NSInteger, GCDWebServerSuccessfulHTTPStatusCode) {
  kGCDWebServerHTTPStatusCode_OK = 200,
  kGCDWebServerHTTPStatusCode_Created = 201,
  kGCDWebServerHTTPStatusCode_Accepted = 202,
  kGCDWebServerHTTPStatusCode_NonAuthoritativeInformation = 203,
  kGCDWebServerHTTPStatusCode_NoContent = 204,
  kGCDWebServerHTTPStatusCode_ResetContent = 205,
  kGCDWebServerHTTPStatusCode_PartialContent = 206,
  kGCDWebServerHTTPStatusCode_MultiStatus = 207,
  kGCDWebServerHTTPStatusCode_AlreadyReported = 208
};

/**
 *  Convenience constants for "redirection" HTTP status codes.
 */
typedef NS_ENUM(NSInteger, GCDWebServerRedirectionHTTPStatusCode) {
  kGCDWebServerHTTPStatusCode_MultipleChoices = 300,
  kGCDWebServerHTTPStatusCode_MovedPermanently = 301,
  kGCDWebServerHTTPStatusCode_Found = 302,
  kGCDWebServerHTTPStatusCode_SeeOther = 303,
  kGCDWebServerHTTPStatusCode_NotModified = 304,
  kGCDWebServerHTTPStatusCode_UseProxy = 305,
  kGCDWebServerHTTPStatusCode_TemporaryRedirect = 307,
  kGCDWebServerHTTPStatusCode_PermanentRedirect = 308
};

/**
 *  Convenience constants for "client error" HTTP status codes.
 */
typedef NS_ENUM(NSInteger, GCDWebServerClientErrorHTTPStatusCode) {
  kGCDWebServerHTTPStatusCode_BadRequest = 400,
  kGCDWebServerHTTPStatusCode_Unauthorized = 401,
  kGCDWebServerHTTPStatusCode_PaymentRequired = 402,
  kGCDWebServerHTTPStatusCode_Forbidden = 403,
  kGCDWebServerHTTPStatusCode_NotFound = 404,
  kGCDWebServerHTTPStatusCode_MethodNotAllowed = 405,
  kGCDWebServerHTTPStatusCode_NotAcceptable = 406,
  kGCDWebServerHTTPStatusCode_ProxyAuthenticationRequired = 407,
  kGCDWebServerHTTPStatusCode_RequestTimeout = 408,
  kGCDWebServerHTTPStatusCode_Conflict = 409,
  kGCDWebServerHTTPStatusCode_Gone = 410,
  kGCDWebServerHTTPStatusCode_LengthRequired = 411,
  kGCDWebServerHTTPStatusCode_PreconditionFailed = 412,
  kGCDWebServerHTTPStatusCode_RequestEntityTooLarge = 413,
  kGCDWebServerHTTPStatusCode_RequestURITooLong = 414,
  kGCDWebServerHTTPStatusCode_UnsupportedMediaType = 415,
  kGCDWebServerHTTPStatusCode_RequestedRangeNotSatisfiable = 416,
  kGCDWebServerHTTPStatusCode_ExpectationFailed = 417,
  kGCDWebServerHTTPStatusCode_UnprocessableEntity = 422,
  kGCDWebServerHTTPStatusCode_Locked = 423,
  kGCDWebServerHTTPStatusCode_FailedDependency = 424,
  kGCDWebServerHTTPStatusCode_UpgradeRequired = 426,
  kGCDWebServerHTTPStatusCode_PreconditionRequired = 428,
  kGCDWebServerHTTPStatusCode_TooManyRequests = 429,
  kGCDWebServerHTTPStatusCode_RequestHeaderFieldsTooLarge = 431
};

/**
 *  Convenience constants for "server error" HTTP status codes.
 */
typedef NS_ENUM(NSInteger, GCDWebServerServerErrorHTTPStatusCode) {
  kGCDWebServerHTTPStatusCode_InternalServerError = 500,
  kGCDWebServerHTTPStatusCode_NotImplemented = 501,
  kGCDWebServerHTTPStatusCode_BadGateway = 502,
  kGCDWebServerHTTPStatusCode_ServiceUnavailable = 503,
  kGCDWebServerHTTPStatusCode_GatewayTimeout = 504,
  kGCDWebServerHTTPStatusCode_HTTPVersionNotSupported = 505,
  kGCDWebServerHTTPStatusCode_InsufficientStorage = 507,
  kGCDWebServerHTTPStatusCode_LoopDetected = 508,
  kGCDWebServerHTTPStatusCode_NotExtended = 510,
  kGCDWebServerHTTPStatusCode_NetworkAuthenticationRequired = 511
};
