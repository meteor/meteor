/*
 * Crypto-JS v2.5.3
 * http://code.google.com/p/crypto-js/
 * (c) 2009-2012 by Jeff Mott. All rights reserved.
 * http://code.google.com/p/crypto-js/wiki/License
 */
(function(){var c=Crypto,j=c.util,d=c.charenc,k=d.UTF8,o=d.Binary;c.PBKDF2=function(e,f,d,a){function l(a,b){return c.HMAC(p,b,a,{asBytes:!0})}e.constructor==String&&(e=k.stringToBytes(e));f.constructor==String&&(f=k.stringToBytes(f));for(var p=a&&a.hasher||c.SHA1,q=a&&a.iterations||1,b=[],m=1;b.length<d;){for(var g=l(e,f.concat(j.wordsToBytes([m]))),i=g,n=1;n<q;n++)for(var i=l(e,i),h=0;h<g.length;h++)g[h]^=i[h];b=b.concat(g);m++}b.length=d;return a&&a.asBytes?b:a&&a.asString?o.bytesToString(b):j.bytesToHex(b)}})();
