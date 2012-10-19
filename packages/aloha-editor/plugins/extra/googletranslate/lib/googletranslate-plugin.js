/* googletranslate-plugin.js is part of Aloha Editor project http://aloha-editor.org
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
/**
 * register the plugin with unique name
 */

define([
    'aloha',
	'aloha/plugin',
	'aloha/floatingmenu',
], function CiteClosure (Aloha, Plugin, FloatingMenu ) {
	

	var jQuery = Aloha.jQuery;
	

	return Plugin.create('googletranslate', {
		
		/**
		 * Configure the available languages to translate to. A complete list of supported languages can be found here:
		 * http://code.google.com/apis/language/translate/v2/using_rest.html
		 */
		translateLangs: [ 'en', 'de', 'fr', 'it' ],
		
		/**
		 * Google translate API key
		 */
		apiKey: "AIzaSyBgsTE6JQ5wsgERpi6m2xBY-9pCn2I5zcA",
		
		/**
		 * Initialize the plugin
		 */
		init: function () {
			var that = this;
			
			Aloha.require( ['css!googletranslate/css/googletranslate.css']);
		
			// use configured api key
			if (this.settings.apiKey) {
				this.apiKey = this.settings.apiKey;
			}
		
			// create buttons for all translation langs
			for (var i=0; i<this.translateLangs.length; i++) {
			    FloatingMenu.addButton(
			        'Aloha.continuoustext',
			        new Aloha.ui.Button({
			            'iconClass' : 'GENTICS_button GENTICS_button_googleTranslate_' + that.translateLangs[i],
			            'size' : 'small',
			            'onclick' : function (a,b,c) {
			        		// determine target lang using the icon class
			        		// there should obviously be a better way to
			        		// determine which button has been clicked...
			        		var targetLang = a.iconCls.replace("GENTICS_button GENTICS_button_googleTranslate_", "");
			        		that.translate(targetLang);
			        	},
			            'tooltip' : that.translateLangs[i],
			            'toggle' : false
			        }),
			        'Translate',
			        1
			    );
			}
		},
		
		/**
		 * translate a text using the google translate api
		 * @param target language
		 * @return void
		 */
		translate: function (targetLang) {
			var that = this;
			var tree = Aloha.Selection.getRangeObject().getSelectionTree();
			var tSource = new Array();
			var c; // the current item
			for (var i=0; i<tree.length; i++) {
				c = tree[i];
				if (c.selection != "none") {
					if (c.selection == "full") {
						tSource.push(jQuery(c.domobj).text());
					} else if (c.selection == "partial") {
						tSource.push(
							jQuery(c.domobj).text().substring(c.startOffset, c.endOffset)
						);
					}
				}
			}
		
			if (tSource.length > 0) {
				var qparams = "";
				for (var i=0; i < tSource.length; i++) {
					qparams += "&q=" + tSource[i];
				}
		
				jQuery.ajax({ type: "GET",
					dataType: "jsonp",
					targetLang: targetLang, // store a reference to the target language to have it available when success function is triggered
					url: 'https://www.googleapis.com/language/translate/v2' +
						'?key=' + this.apiKey +
						'&target=' + targetLang + '&prettyprint=false' +
						qparams,
					success: function(res) {
						// handle errors
						if (typeof res.error == "object") {
							that.log("ERROR", "Unable to translate. Error: [" + res.error.code + "] " + res.error.message);
							return false;
						}
		
						// translation successful
						if (res.data && res.data.translations) {
							that.applyTranslation(res.data.translations, tree, this.targetLang);
						}
					}
				});
			}
		},
		
		/**
		 * apply a translation provided by google to the current selection
		 * @param translations list of translations provided by google
		 * @param tree the selection tree the translations will be applied to
		 * @param {String} lang language the content has been translated to
		 */
		applyTranslation: function (translations, tree, lang) {
			var key = 0;
			for (var i=0; i<tree.length; i++) {

				var c = tree[i];

				if (c.selection != "none") {
					if (c.selection == "full") {
						this.replaceText(c, translations[key].translatedText, lang);
					} else if (c.selection == "partial") {
						var txt = jQuery(c.domobj).text();
						var pre = txt.substring(0, c.startOffset);
						var post = txt.substring(c.endOffset, txt.length);
						this.replaceText(c, pre + translations[key].translatedText + post, null);
					}
					key++;
				}
			}
		},
		
		/**
		 * replace text in a selectionTree
		 * @param selectionTreeEntry a single selection tree entry where the text should be replaced
		 * @param text replacement text
		 * @return void
		 */
		replaceText: function (selectionTreeEntry, text, lang) {
			// GoogleTranslate API will trim spaces so we have to check if
			// there was a leading or trailing space
			// check if the first char of the original string is a space
			if (selectionTreeEntry.domobj.textContent.substring(0,1) == ' ') {
				text = ' ' + text;
			}
		
			// check if the last character of the original string is a space
			if (selectionTreeEntry.domobj.textContent.substring(
					selectionTreeEntry.domobj.textContent.length-1,selectionTreeEntry.domobj.textContent.length) == ' ') {
				text = text + ' ';
			}
		
			// special treatment for text nodes, which have to be replaced
			if (selectionTreeEntry.domobj.nodeType == 3) {
				jQuery(selectionTreeEntry.domobj)
					.replaceWith(document
					.createTextNode(text)
				);
			} else {
				jQuery(selectionTreeEntry.domobj)
					.html(text)
					// set the language attribute for non-text-nodes
					.attr('lang', lang);
			}
		}
	});
});
