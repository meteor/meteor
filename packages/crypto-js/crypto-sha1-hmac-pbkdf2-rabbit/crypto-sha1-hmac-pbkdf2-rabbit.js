/*
 * Crypto-JS v2.5.3
 * http://code.google.com/p/crypto-js/
 * (c) 2009-2012 by Jeff Mott. All rights reserved.
 * http://code.google.com/p/crypto-js/wiki/License
 */
(typeof Crypto=="undefined"||!Crypto.util)&&function(){var e=window.Crypto={},f=e.util={rotl:function(c,a){return c<<a|c>>>32-a},rotr:function(c,a){return c<<32-a|c>>>a},endian:function(c){if(c.constructor==Number)return f.rotl(c,8)&16711935|f.rotl(c,24)&4278255360;for(var a=0;a<c.length;a++)c[a]=f.endian(c[a]);return c},randomBytes:function(c){for(var a=[];c>0;c--)a.push(Math.floor(Math.random()*256));return a},bytesToWords:function(c){for(var a=[],d=0,g=0;d<c.length;d++,g+=8)a[g>>>5]|=(c[d]&255)<<
24-g%32;return a},wordsToBytes:function(c){for(var a=[],d=0;d<c.length*32;d+=8)a.push(c[d>>>5]>>>24-d%32&255);return a},bytesToHex:function(c){for(var a=[],d=0;d<c.length;d++)a.push((c[d]>>>4).toString(16)),a.push((c[d]&15).toString(16));return a.join("")},hexToBytes:function(c){for(var a=[],d=0;d<c.length;d+=2)a.push(parseInt(c.substr(d,2),16));return a},bytesToBase64:function(c){if(typeof btoa=="function")return btoa(h.bytesToString(c));for(var a=[],d=0;d<c.length;d+=3)for(var g=c[d]<<16|c[d+1]<<
8|c[d+2],b=0;b<4;b++)d*8+b*6<=c.length*8?a.push("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".charAt(g>>>6*(3-b)&63)):a.push("=");return a.join("")},base64ToBytes:function(c){if(typeof atob=="function")return h.stringToBytes(atob(c));for(var c=c.replace(/[^A-Z0-9+\/]/ig,""),a=[],d=0,g=0;d<c.length;g=++d%4)g!=0&&a.push(("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".indexOf(c.charAt(d-1))&Math.pow(2,-2*g+8)-1)<<g*2|"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".indexOf(c.charAt(d))>>>
6-g*2);return a}},e=e.charenc={};e.UTF8={stringToBytes:function(c){return h.stringToBytes(unescape(encodeURIComponent(c)))},bytesToString:function(c){return decodeURIComponent(escape(h.bytesToString(c)))}};var h=e.Binary={stringToBytes:function(c){for(var a=[],d=0;d<c.length;d++)a.push(c.charCodeAt(d)&255);return a},bytesToString:function(c){for(var a=[],d=0;d<c.length;d++)a.push(String.fromCharCode(c[d]));return a.join("")}}}();
(function(){var e=Crypto,f=e.util,h=e.charenc,c=h.UTF8,a=h.Binary,d=e.SHA1=function(c,b){var i=f.wordsToBytes(d._sha1(c));return b&&b.asBytes?i:b&&b.asString?a.bytesToString(i):f.bytesToHex(i)};d._sha1=function(a){a.constructor==String&&(a=c.stringToBytes(a));var b=f.bytesToWords(a),i=a.length*8,a=[],d=1732584193,j=-271733879,e=-1732584194,k=271733878,h=-1009589776;b[i>>5]|=128<<24-i%32;b[(i+64>>>9<<4)+15]=i;for(i=0;i<b.length;i+=16){for(var m=d,p=j,q=e,n=k,u=h,l=0;l<80;l++){if(l<16)a[l]=b[i+l];else{var r=
a[l-3]^a[l-8]^a[l-14]^a[l-16];a[l]=r<<1|r>>>31}r=(d<<5|d>>>27)+h+(a[l]>>>0)+(l<20?(j&e|~j&k)+1518500249:l<40?(j^e^k)+1859775393:l<60?(j&e|j&k|e&k)-1894007588:(j^e^k)-899497514);h=k;k=e;e=j<<30|j>>>2;j=d;d=r}d+=m;j+=p;e+=q;k+=n;h+=u}return[d,j,e,k,h]};d._blocksize=16;d._digestsize=20})();
(function(){var e=Crypto,f=e.util,h=e.charenc,c=h.UTF8,a=h.Binary;e.HMAC=function(d,e,b,i){e.constructor==String&&(e=c.stringToBytes(e));b.constructor==String&&(b=c.stringToBytes(b));b.length>d._blocksize*4&&(b=d(b,{asBytes:!0}));for(var o=b.slice(0),b=b.slice(0),j=0;j<d._blocksize*4;j++)o[j]^=92,b[j]^=54;d=d(o.concat(d(b.concat(e),{asBytes:!0})),{asBytes:!0});return i&&i.asBytes?d:i&&i.asString?a.bytesToString(d):f.bytesToHex(d)}})();
(function(){var e=Crypto,f=e.util,h=e.charenc,c=h.UTF8,a=h.Binary;e.PBKDF2=function(d,g,b,i){function o(b,a){return e.HMAC(j,a,b,{asBytes:!0})}d.constructor==String&&(d=c.stringToBytes(d));g.constructor==String&&(g=c.stringToBytes(g));for(var j=i&&i.hasher||e.SHA1,h=i&&i.iterations||1,k=[],t=1;k.length<b;){for(var m=o(d,g.concat(f.wordsToBytes([t]))),p=m,q=1;q<h;q++)for(var p=o(d,p),n=0;n<m.length;n++)m[n]^=p[n];k=k.concat(m);t++}k.length=b;return i&&i.asBytes?k:i&&i.asString?a.bytesToString(k):f.bytesToHex(k)}})();
(function(){var e=Crypto,f=e.util,h=e.charenc.UTF8,c=[],a=[],d,g=e.Rabbit={encrypt:function(b,a){var c=h.stringToBytes(b),d=f.randomBytes(8),s=a.constructor==String?e.PBKDF2(a,d,32,{asBytes:!0}):a;g._rabbit(c,s,f.bytesToWords(d));return f.bytesToBase64(d.concat(c))},decrypt:function(b,a){var c=f.base64ToBytes(b),d=c.splice(0,8),s=a.constructor==String?e.PBKDF2(a,d,32,{asBytes:!0}):a;g._rabbit(c,s,f.bytesToWords(d));return h.bytesToString(c)},_rabbit:function(b,a,d){g._keysetup(a);d&&g._ivsetup(d);
a=[];for(d=0;d<b.length;d++){if(d%16==0){g._nextstate();a[0]=c[0]^c[5]>>>16^c[3]<<16;a[1]=c[2]^c[7]>>>16^c[5]<<16;a[2]=c[4]^c[1]>>>16^c[7]<<16;a[3]=c[6]^c[3]>>>16^c[1]<<16;for(var e=0;e<4;e++)a[e]=(a[e]<<8|a[e]>>>24)&16711935|(a[e]<<24|a[e]>>>8)&4278255360;for(e=120;e>=0;e-=8)a[e/8]=a[e>>>5]>>>24-e%32&255}b[d]^=a[d%16]}},_keysetup:function(b){c[0]=b[0];c[2]=b[1];c[4]=b[2];c[6]=b[3];c[1]=b[3]<<16|b[2]>>>16;c[3]=b[0]<<16|b[3]>>>16;c[5]=b[1]<<16|b[0]>>>16;c[7]=b[2]<<16|b[1]>>>16;a[0]=f.rotl(b[2],16);
a[2]=f.rotl(b[3],16);a[4]=f.rotl(b[0],16);a[6]=f.rotl(b[1],16);a[1]=b[0]&4294901760|b[1]&65535;a[3]=b[1]&4294901760|b[2]&65535;a[5]=b[2]&4294901760|b[3]&65535;a[7]=b[3]&4294901760|b[0]&65535;for(b=d=0;b<4;b++)g._nextstate();for(b=0;b<8;b++)a[b]^=c[b+4&7]},_ivsetup:function(b){var c=f.endian(b[0]),b=f.endian(b[1]),d=c>>>16|b&4294901760,e=b<<16|c&65535;a[0]^=c;a[1]^=d;a[2]^=b;a[3]^=e;a[4]^=c;a[5]^=d;a[6]^=b;a[7]^=e;for(c=0;c<4;c++)g._nextstate()},_nextstate:function(){for(var b=[],e=0;e<8;e++)b[e]=
a[e];a[0]=a[0]+1295307597+d>>>0;a[1]=a[1]+3545052371+(a[0]>>>0<b[0]>>>0?1:0)>>>0;a[2]=a[2]+886263092+(a[1]>>>0<b[1]>>>0?1:0)>>>0;a[3]=a[3]+1295307597+(a[2]>>>0<b[2]>>>0?1:0)>>>0;a[4]=a[4]+3545052371+(a[3]>>>0<b[3]>>>0?1:0)>>>0;a[5]=a[5]+886263092+(a[4]>>>0<b[4]>>>0?1:0)>>>0;a[6]=a[6]+1295307597+(a[5]>>>0<b[5]>>>0?1:0)>>>0;a[7]=a[7]+3545052371+(a[6]>>>0<b[6]>>>0?1:0)>>>0;d=a[7]>>>0<b[7]>>>0?1:0;b=[];for(e=0;e<8;e++){var f=c[e]+a[e]>>>0,g=f&65535,h=f>>>16;b[e]=((g*g>>>17)+g*h>>>15)+h*h^((f&4294901760)*
f>>>0)+((f&65535)*f>>>0)>>>0}c[0]=b[0]+(b[7]<<16|b[7]>>>16)+(b[6]<<16|b[6]>>>16);c[1]=b[1]+(b[0]<<8|b[0]>>>24)+b[7];c[2]=b[2]+(b[1]<<16|b[1]>>>16)+(b[0]<<16|b[0]>>>16);c[3]=b[3]+(b[2]<<8|b[2]>>>24)+b[1];c[4]=b[4]+(b[3]<<16|b[3]>>>16)+(b[2]<<16|b[2]>>>16);c[5]=b[5]+(b[4]<<8|b[4]>>>24)+b[3];c[6]=b[6]+(b[5]<<16|b[5]>>>16)+(b[4]<<16|b[4]>>>16);c[7]=b[7]+(b[6]<<8|b[6]>>>24)+b[5]}}})();
