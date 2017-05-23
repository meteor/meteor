/*
 * Crypto-JS v2.5.3
 * http://code.google.com/p/crypto-js/
 * (c) 2009-2012 by Jeff Mott. All rights reserved.
 * http://code.google.com/p/crypto-js/wiki/License
 */
(function(){var b=Crypto,l=b.util,f=b.charenc,m=f.UTF8,t=f.Binary;if(!b.nextTick)if(typeof process!="undefined"&&typeof process.nextTick!=="undefined")b.nextTick=process.nextTick;else if(typeof setTimeout!=="undefined")b.nextTick=function(b){setTimeout(b,0)};b.PBKDF2Async=function(e,g,i,f,a){function n(b){if(o){var a=c.length/d._digestsize*j+b;setTimeout(function(){o(Math.round(a/u*100))},0)}}function p(a,c){return b.HMAC(d,c,a,{asBytes:!0})}e.constructor==String&&(e=m.stringToBytes(e));g.constructor==
String&&(g=m.stringToBytes(g));var d=a&&a.hasher||b.SHA1,j=a&&a.iterations||1,o=a&&a.onProgressChange,u=Math.ceil(i/d._digestsize)*j,h=b.nextTick,c=[],q=1,r,s;h(r=function(){if(c.length<i){var b=p(e,g.concat(l.wordsToBytes([q])));n(1);var d=b,k=1;h(s=function(){if(k<j){d=p(e,d);for(var a=0;a<b.length;a++)b[a]^=d[a];k++;n(k);h(s)}else c=c.concat(b),q++,h(r)})}else c.length=i,f(a&&a.asBytes?c:a&&a.asString?t.bytesToString(c):l.bytesToHex(c))})}})();
