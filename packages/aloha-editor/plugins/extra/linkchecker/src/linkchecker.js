/* linkchecker.js is part of Aloha Editor project http://aloha-editor.org
 *
 * Aloha Editor is a WYSIWYG HTML5 inline editing library and editor. 
 * Copyright (c) 2010-2012 Gentics Software GmbH, Vienna, Austria.
 * Contributors http://aloha-editor.org/contribution.php 
 * 
 * Aloha Editor is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; either version 2
 * of the License, or any later version.
 *
 * Aloha Editor is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301, USA.
 * 
 * As an additional permission to the GNU GPL version 2, you may distribute
 * non-source (e.g., minimized or compacted) forms of the Aloha-Editor
 * source code without the copy of the GNU GPL normally required,
 * provided you include this license notice and a URL through which
 * recipients can access the Corresponding Source.
 */
(function(window, undefined) {
	

	var
		jQuery = window.alohaQuery || window.jQuery, $ = jQuery,
		GENTICS = window.GENTICS,
		Aloha = window.Aloha;

	Aloha.LinkChecker = new Aloha.Plugin('linkchecker');

	/**
	 * Configure the available languages
	 * http://en.wikipedia.org/wiki/List_of_HTTP_status_codes
	 */
	Aloha.LinkChecker.languages = ['en'];

	/**
	 * All error codes that have an explanation.
	 */
	Aloha.LinkChecker.errorCodes = [400, 401, 402, 403, 404, 405,
											406, 407, 408, 409, 410, 411,
											412, 413, 414, 415, 416, 417,
											418, 500, 501, 502, 503, 504,
											505, 506];
	/**
	 * This codes are asumed temporary errors.
	 */
	Aloha.LinkChecker.warningCodes = [404, 411, 412, 413, 500, 503,
											  504, 505];


	/**
	 * Initialize the plugin and set initialize flag on true
	 */
	Aloha.LinkChecker.init = function () {

		this.proxyUrl = null;

		if ( typeof Aloha.LinkChecker.settings.proxyUrl !== 'undefined' ) {
			this.proxyUrl = Aloha.LinkChecker.settings.proxyUrl;
		}

		// initialize the timer
		this.timer = {};

		// initialize the running requests
		this.xhr = {};

		// remember reference to this class for callback
		var that = this;

		// mark active Editable with a css class
		Aloha.EventRegistry.subscribe(
				Aloha,
				"editableActivated",
				function (jEvent, aEvent) {
					// find all link tags
					aEvent.editable.obj.find('a').each(function() {
						that.checkLink(this, jQuery(this).attr('href'), 0);
					});
				}
		);

		// remove active Editable ccs class
		Aloha.EventRegistry.subscribe(
				Aloha,
				"editableDeactivated",
				function (jEvent, aEvent) {
					// remove link marks
					that.makeClean(aEvent.editable.obj);
				}
		);

		// remove active Editable ccs class
		Aloha.EventRegistry.subscribe(
				Aloha,
				"hrefChanged",
				function (jEvent, aEvent) {
					that.checkLink(aEvent.obj, 'hrefChanged');
				}
		);

	};

	Aloha.LinkChecker.checkLink = function (obj, scope, delay, timeout) {
		var that = this,
			url, cleanUrl;

		// extract url from link object
		url = jQuery(obj).attr('href');
		cleanUrl = url;

		// i probably an internal link
		if ( typeof url == 'string' && !/^http/.test( url.toLowerCase() ) ) {
			this.makeCleanLink(obj);
			return;
		}

		if ( this.proxyUrl ) {
			url = this.proxyUrl + url;
		}

		// abort already running ajax requests for the scope
		if (this.xhr[scope]) {
			this.xhr[scope].abort();
			this.xhr[scope] = undefined;
		}

		this.timer[scope] = this.urlExists(
			url,
			// success
			function(xhr) {
				that.makeCleanLink(obj);
			},
			//failure
			function(xhr) {
				var e, o;

				if ( obj ) {
					if ( jQuery.inArray(xhr.status, that.errorCodes) >= 0 ) {
						e = xhr.status;
					} else {
						e = '0';
					}
					o = jQuery(obj);
					// when the link has a title and was not yet marked as being invalid, we store the title in 'data-title'
					if ( o.attr('title') && !o.attr('data-invalid') ) {
						o.attr('data-title', o.attr('title'));
					}
					// now we mark the link as being invalid
					o.attr('data-invalid', 'true');
					// and we set an error message to the title
					o.attr('title', cleanUrl+'. '+that.i18n('error.'+e));
					// set the link class
					if ( jQuery.inArray(xhr.status, that.warningCodes) >= 0 ) {
						o.addClass('aloha-link-warn');
					} else {
						o.addClass('aloha-link-error');
					}
				}
			},
			scope,
			timeout,
			delay
		);
	};

	Aloha.LinkChecker.urlExists = function (url, successFunc, failureFunc, scope, timeout, delay) {
		var that = this, newTimer;

		// abort timer for that request
		clearTimeout(this.timer[scope]);

		delay = (delay != null && typeof delay !== 'undefined' ) ? delay : 700;

		// start timer for delayed request
		newTimer = window.setTimeout( function() {

			// start request
			that.xhr[scope] = jQuery.ajax({
				url: url,
				timeout: timeout ? 10000 : timeout,
				type: 'HEAD',
				complete: function(xhr) {
					// abort timer for that request
					clearTimeout(newTimer);
					try {
						// if response HTTP status 200 link is ok
						// this implementation does NOT cover redirects!
						if (xhr.status < 400) {
							successFunc.call(this, xhr);
						} else {
							failureFunc.call(this, xhr);
						}
					} catch(e) {
						failureFunc.call(this, {'status':0});
					}
				}
			});

		}, delay);

		return newTimer;
	};

	Aloha.LinkChecker.makeCleanLink = function (obj) {
		if ( obj ) {
			var o = jQuery(obj);
			// restore the original title (if one existed)
			if ( o.attr('data-title') ) {
				o.attr('title', o.attr('data-title'));
			} else {
				// otherwise remove the title
				o.removeAttr('title');
			}
			// remove the temporary data
			o.removeAttr('data-title');
			o.removeAttr('data-invalid');
			// remove the classes
			o.removeClass('aloha-link-error');
			o.removeClass('aloha-link-warn');
		}
	};

	Aloha.LinkChecker.makeClean = function (editable) {
		var that = this;
		// find all link tags
		editable.find('a').each(function() {
			that.makeCleanLink(this);
		});
	};

	Aloha.LinkChecker.urlencode = function (str) {
		// URL-encodes string
		//
		// version: 1008.1718
		// discuss at: http://phpjs.org/functions/urlencode
		// +   original by: Philip Peterson
		// +   improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
		// +	  input by: AJ
		// +   improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
		// +   improved by: Brett Zamir (http://brett-zamir.me)
		// +   bugfixed by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
		// +	  input by: travc
		// +	  input by: Brett Zamir (http://brett-zamir.me)
		// +   bugfixed by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
		// +   improved by: Lars Fischer
		// +	  input by: Ratheous
		// +	  reimplemented by: Brett Zamir (http://brett-zamir.me)
		// +   bugfixed by: Joris
		// +	  reimplemented by: Brett Zamir (http://brett-zamir.me)
		// %		  note 1: This reflects PHP 5.3/6.0+ behavior
		// %		note 2: Please be aware that this function expects to encode into UTF-8 encoded strings, as found on
		// %		note 2: pages served as UTF-8
		// *	 example 1: urlencode('Kevin van Zonneveld!');
		// *	 returns 1: 'Kevin+van+Zonneveld%21'
		// *	 example 2: urlencode('http://kevin.vanzonneveld.net/');
		// *	 returns 2: 'http%3A%2F%2Fkevin.vanzonneveld.net%2F'
		// *	 example 3: urlencode('http://www.google.nl/search?q=php.js&ie=utf-8&oe=utf-8&aq=t&rls=com.ubuntu:en-US:unofficial&client=firefox-a');
		// *	 returns 3: 'http%3A%2F%2Fwww.google.nl%2Fsearch%3Fq%3Dphp.js%26ie%3Dutf-8%26oe%3Dutf-8%26aq%3Dt%26rls%3Dcom.ubuntu%3Aen-US%3Aunofficial%26client%3Dfirefox-a'
		str = (str+'').toString();

		// Tilde should be allowed unescaped in future versions of PHP (as reflected below), but if you want to reflect current
		// PHP behavior, you would need to add ".replace(/~/g, '%7E');" to the following.
		return encodeURIComponent(str).replace(/!/g, '%21').replace(/'/g, '%27').replace(/\(/g, '%28').
																		replace(/\)/g, '%29').replace(/\*/g, '%2A').replace(/%20/g, '+');
	};

})(window);