/*
 * Crypto-JS v2.5.3
 * http://code.google.com/p/crypto-js/
 * (c) 2009-2012 by Jeff Mott. All rights reserved.
 * http://code.google.com/p/crypto-js/wiki/License
 */
(function(){var c=Crypto,i=c.util,g=c.charenc,h=g.UTF8,j=g.Binary;c.HMAC=function(b,d,a,e){d.constructor==String&&(d=h.stringToBytes(d));a.constructor==String&&(a=h.stringToBytes(a));a.length>b._blocksize*4&&(a=b(a,{asBytes:!0}));for(var c=a.slice(0),a=a.slice(0),f=0;f<b._blocksize*4;f++)c[f]^=92,a[f]^=54;b=b(c.concat(b(a.concat(d),{asBytes:!0})),{asBytes:!0});return e&&e.asBytes?b:e&&e.asString?j.bytesToString(b):i.bytesToHex(b)}})();
