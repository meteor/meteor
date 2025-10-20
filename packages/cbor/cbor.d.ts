// Type definitions for CBOR package

declare module "meteor/cbor" {
  namespace CBOR {
    interface CBORAnalysis {
      cborSize: number;
      jsonSize: number;
      compressionRatio: number;
      savings: number;
      savingsPercent: number;
    }

    interface CBORErrorAnalysis {
      error: string;
      cborSize: null;
      jsonSize: null;
      compressionRatio: null;
      savings: null;
      savingsPercent: null;
    }

    interface FileProxy {
      data: Buffer | Uint8Array;
      name: string;
      type: string;
      size: number;
      lastModified: number;
      _isFileProxy: true;
      arrayBuffer(): Promise<ArrayBuffer>;
      text(): Promise<string>;
      stream(): {
        getReader(): {
          read(): Promise<{ done: boolean; value?: Uint8Array }>;
        };
      };
    }

    interface BlobProxy {
      data: Buffer | Uint8Array;
      type: string;
      size: number;
      _isBlobProxy: true;
      arrayBuffer(): Promise<ArrayBuffer>;
      text(): Promise<string>;
    }

    interface CBORTaggedValue {
      _cborTag: number;
      _cborValue: any;
    }

    interface DDPCapabilities {
      ddpVersion: string;
      ejson: boolean;
      cbor: boolean;
      binaryStreaming: boolean;
    }

    interface DDPMessage {
      format: 'ejson' | 'cbor';
      data: string;
      metadata?: {
        hasBinaryData?: boolean;
        size?: number;
        originalSize?: number;
        cborSize?: number;
      };
    }

    interface DDPSerializationOptions {
      supportsCBOR?: boolean;
      preferCBOR?: boolean;
    }

    // Core encoding/decoding functions
    function encode(value: any): Uint8Array;
    function encodeAsync(value: any): Promise<Uint8Array>;
    function decode(data: Uint8Array): any;

    // String serialization for network transport
    function stringify(value: any): string;
    function stringifyAsync(value: any): Promise<string>;
    function parse(string: string): any;

    // Base64 conversion utilities
    function toBase64(cborData: Uint8Array): string;
    function fromBase64(base64String: string): Uint8Array;

    // Utility functions
    function hasBinaryData(value: any): boolean;
    function clone(value: any): any;
    function cloneAsync(value: any): Promise<any>;
    function equals(a: any, b: any): boolean;
    function analyze(value: any): CBORAnalysis | CBORErrorAnalysis;

    // EJSON compatibility
    function fromEJSON(ejsonValue: any): any;
    function toEJSON(cborValue: any): any;
    
    // EJSON API compatibility layer (makes CBOR a drop-in replacement)
    function addType(name: string, factory: (value: any) => any): void;
    function isBinary(obj: any): boolean;
    function newBinary(size: number): Uint8Array;
    function toJSONValue(value: any): any;
    function fromJSONValue(value: any): any;

    // Internal classes (for testing and advanced usage)
    class _CBOREncoder {
      constructor();
      encode(value: any): Uint8Array;
      encodeAsync(value: any): Promise<Uint8Array>;
      static METEOR_TAGS: {
        FILE: number;
        BUFFER: number;
        BLOB: number;
        DATE: number;
        EJSON_DATE: number;
        EJSON_BINARY: number;
        MONGO_OBJECTID: number;
      };
    }

    class _CBORDecoder {
      constructor(data: Uint8Array);
      decode(): any;
      static METEOR_TAGS: {
        FILE: number;
        BUFFER: number;
        BLOB: number;
        DATE: number;
        EJSON_DATE: number;
        EJSON_BINARY: number;
        MONGO_OBJECTID: number;
      };
    }

    // Private utility for binary data detection
    function _containsBinaryData(obj: any): boolean;
  }

  export { CBOR };
}

// Extend DDPCommon with CBOR support
declare module "meteor/ddp-common" {
  namespace DDPCommon {
    // Enhanced DDP functions with CBOR support
    function stringifyDDPWithCBOR(
      msg: any, 
      options?: CBOR.DDPSerializationOptions
    ): CBOR.DDPMessage;

    function stringifyDDPWithCBORAsync(
      msg: any, 
      options?: CBOR.DDPSerializationOptions
    ): Promise<CBOR.DDPMessage>;

    function parseDDPWithCBOR(
      message: string | CBOR.DDPMessage
    ): any | null;

    // Capability negotiation
    function negotiateCapabilities(
      clientCaps?: Partial<CBOR.DDPCapabilities>,
      serverCaps?: Partial<CBOR.DDPCapabilities>
    ): CBOR.DDPCapabilities;

    // Format selection utility
    function chooseBestFormat(
      message: any,
      capabilities: CBOR.DDPCapabilities
    ): 'ejson' | 'cbor';
  }
}

// Global type augmentations for better File/Buffer support
declare global {
  interface File {
    // Ensure File interface is available in both environments
  }

  interface Buffer {
    // Ensure Buffer interface is available
  }

  interface Blob {
    // Ensure Blob interface is available
  }
}

// Meteor method parameter type helpers
declare module "meteor/meteor" {
  namespace Meteor {
    interface MethodThisType {
      // Enhanced method context with CBOR file support
    }
  }
}

// Export type utilities for user applications
export type FileOrProxy = File | CBOR.FileProxy;
export type BlobOrProxy = Blob | CBOR.BlobProxy;
export type BufferOrArray = Buffer | Uint8Array;

export interface UploadMethodParams {
  file: FileOrProxy;
  metadata?: {
    description?: string;
    tags?: string[];
    [key: string]: any;
  };
}

export interface UploadMethodResult {
  success: boolean;
  filename: string;
  size: number;
  uploadId?: string;
  url?: string;
}

// Type guard functions
export function isFileProxy(obj: any): obj is CBOR.FileProxy;
export function isBlobProxy(obj: any): obj is CBOR.BlobProxy;
export function isCBORTaggedValue(obj: any): obj is CBOR.CBORTaggedValue;
