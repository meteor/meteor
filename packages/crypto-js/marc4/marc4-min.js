/*
 * Crypto-JS v2.5.3
 * http://code.google.com/p/crypto-js/
 * (c) 2009-2012 by Jeff Mott. All rights reserved.
 * http://code.google.com/p/crypto-js/wiki/License
 */
(function(){var e=Crypto,h=e.util,i=e.charenc.UTF8,j=e.MARC4={encrypt:function(g,b){var f=i.stringToBytes(g),a=h.randomBytes(16),d=b.constructor==String?e.PBKDF2(b,a,32,{asBytes:!0}):b;j._marc4(f,d,1536);return h.bytesToBase64(a.concat(f))},decrypt:function(g,b){var f=h.base64ToBytes(g),a=f.splice(0,16),a=b.constructor==String?e.PBKDF2(b,a,32,{asBytes:!0}):b;j._marc4(f,a,1536);return i.bytesToString(f)},_marc4:function(g,b,f){var a,d,c,e;for(a=0,c=[];a<256;a++)c[a]=a;for(a=0,d=0;a<256;a++)d=(d+c[a]+
b[a%b.length])%256,e=c[a],c[a]=c[d],c[d]=e;a=d=0;for(b=-f;b<g.length;b++)a=(a+1)%256,d=(d+c[a])%256,e=c[a],c[a]=c[d],c[d]=e,b<0||(g[b]^=c[(c[a]+c[d])%256])}}})();
