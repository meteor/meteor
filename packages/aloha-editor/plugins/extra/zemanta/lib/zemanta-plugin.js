/* zemanta-plugin.js is part of Aloha Editor project http://aloha-editor.org
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
define(
[
'aloha', 
'jquery', 
'aloha/plugin', 
'aloha/floatingmenu', 
'i18n!zemanta/nls/i18n', 
'i18n!aloha/nls/i18n', 
'aloha/console',
'css!zemanta/css/zemanta-widget-alohaeditor.css', 
],
function(Aloha, jQuery, Plugin, FloatingMenu, i18n, i18nCore, console) {
	

	var
		GENTICS = window.GENTICS,
		active = false,
		editableId = false,
		settings = false;

		// check for API key settings
		if ( typeof Aloha.settings.plugins.zemanta === 'undefined' ) {
			settings = {};
		} else {
			settings = Aloha.settings.plugins.zemanta;
		}

		if ( typeof settings.apiKey === 'undefined' ) {
			Aloha.Log.warn( 'Plugin.Zemanta', 'Add your own Zemanta API Key (Aloha.settings.plugins.zemanta.apiKey). Register one here: http://developer.zemanta.com/apps/register/' );
			settings.apiKey = '8n7tl9nikmdps2rhkpusihnt';
		}


	/**
	 * Zemanta API Key for SDK
	*/
	window.ZemantaGetAPIKey = function () {
		return settings.apiKey || false;
	}

	/**
	 * register the plugin with unique name
	 */
	return Plugin.create('zemanta', {
		/**
		 * Configure the available languages
		 */
		languages: ['en'],

		/**
		 * Initialize the plugin and set initialize flag on true
		 */
		init: function(){
			// load Zemanta SDK
			var staticDomain = 'http://static.zemanta.com/';
			Aloha.require([
				'css!' + staticDomain + 'core/zemanta-widget.css',
				staticDomain + 'core/jquery.js',
				staticDomain + 'core/jquery.zemanta.js'
			]);

			this._initButtons();
			//this._initEvents();
		},

		_initButtons: function() {
			var self = this;

			// zemanta button
			FloatingMenu.createScope('Aloha.Zemanta', 'Aloha.continuoustext');
			this.zemantaButton = new Aloha.ui.Button({
				'name' : 'zemanta',
				'iconClass' : 'aloha-button aloha-button-zemanta',
				'size' : 'small',
				'onclick' : function () { self.suggestions(); },
				'tooltip' : i18n.t('button.zemanta.tooltip'),
				'toggle' : true
			});

			FloatingMenu.addButton(
				'Aloha.continuoustext',
				this.zemantaButton,
				i18n.t('floatingmenu.tab.related'),
				1
			);
		},

		_initEvents: function() {
			var self = this;
			// update suggestions with smart content change ...
			Aloha.bind('aloha-editable-deactivated', function(event, rangeObject) {
				// do something ... 
			});
		},
		
		suggestions: function() {
			var self = this,
				widget = document.createElement('div'),
				tags = document.createElement('div'),
				links = document.createElement('div'),
				insertionSpaceId = false,
				insertionSpace = false,
				t0 = this.now();

				this.editableId = Aloha.activeEditable.obj[0].id;

				if (this.active == true) {
					// remove zemanta widgets (button click to activate/deactivate)
					$('#zemanta-sidebar').remove();
					$('#zemanta-suggested-tags').remove();
					$('#zemanta-suggested-links').remove();
					this.active = false;
					return;
				}
				
				if ( Aloha.activeEditable.getContents().length < 140 ) {
					self.zemantaButton.setPressed(false);
					
					Aloha.showMessage( new Aloha.Message( {
						title : i18n.t( 'Information' ),
						text  : i18n.t( 'zemanta.message.shorttext' ),
						type  : Aloha.Message.Type.ALERT
					} ) );
					return;
				}

				widget.setAttribute('id', 'zemanta-sidebar');
				widget.innerHTML = '<div id="zemanta-message" class="zemanta">Loading Zemanta...</div><div id="zemanta-gallery" class="zemanta"></div><div id="zemanta-articles" class="zemanta"></div>';

				tags.setAttribute('id', 'zemanta-suggested-tags');
				tags.innerHTML = '<div id="zemanta-tags" class="zemanta"><div id="zemanta-tags-div"><ul id="zemanta-tags-div-ul"><li class="zemanta-title">&laquo; Tags</li></ul><p class="zem-clear">&nbsp;</p></div></div>';

				links.setAttribute('id', 'zemanta-suggested-links');
				links.innerHTML = '<div id="zemanta-links"><ul id="zemanta-links-div-ul"><li class="zemanta-title"><span>Link recommendations will appear here</span> &laquo; Links</li></ul><p class="zem-clear">&nbsp;</p></div>';

				// if not set via settings insert the widgets below the current editable
				insertionSpaceId = this.editableId;
				if ( typeof this.settings.insertionSpaceId !== 'undefined' ) {
					insertionSpaceId = this.settings.insertionSpaceId;
				}

				// insert zemanta widgets after this dom object
				// @nicetohave different IDs all available widgets and switch to insert before/after that tag
				insertionSpace = document.getElementById(insertionSpaceId);
				if ( !insertionSpace ) {
					// fallback: if the dom object does not exist (from config) insert it after the current editable
					insertionSpaceId = this.editableId;
					insertionSpace = document.getElementById(insertionSpaceId);
				}

				if ( insertionSpace ) {
					insertionSpace.parentNode.insertBefore(widget, insertionSpace.nextSibling);
					insertionSpace.parentNode.insertBefore(links, insertionSpace.nextSibling);
					insertionSpace.parentNode.insertBefore(tags, insertionSpace.nextSibling);
				} else {
					Aloha.Log.warn( 'Plugin.Zemanta', 'There was a problem inserting the Zemanta widgets.' );
				}

			try {
				$ = window.zQuery;
				if (!$) {
					throw 'Plugin.Zemanta: No zQuery available.';
				}
				if ($('#zemanta-message').html() === 'Loading...') {
					$('#zemanta-message').html('Preparing...');
				}

				this.waitForLoad();
				this.active = true;
			} catch ( er ) {
				Aloha.Log.error( 'Plugin.Zemanta', er );
			}
		},
		
		/**
		 * Get current timestamp
		*/
		now: function() {
			return new Date().getTime();
		},

		setPlatform: function($, p) {
			var editableId = Aloha.activeEditable.obj[0].id;
			
			return $.zextend(p, {
				widget_version: 3,
				platform: {
					dnd_supported: true,
					get_editor: function () {
						var editor = {element: null, property: null, type: null, win: null};

						try {
							editor = {
								element: document.getElementById(editableId),
								property: 'innerHTML', 
								type: 'div',
								win: null
							}
						} catch ( er ) {
							Aloha.Log.error( 'Plugin.Zemanta.setPlatform', er );
						}
						return editor;
					}
				}
			});
		},

		waitForLoad: function() {
			var done = false, t0 = null;

			if (typeof $.zemanta === "undefined") {
				$('#zemanta-message').html('Waiting...');
				return;
			}

			t0 = this.now();
			$('#zemanta-message').html('Initializing...');

			try {
				done = $.zemanta.initialize(this.setPlatform($, {
					interface_type: "alohaeditor",
					tags_target_id: "zemanta-tags"
				}));
			} catch ( er ) {
				Aloha.Log.error( 'Plugin.Zemanta.waitForLoad', er );
			}

			if ( !done ) {
				$('#zemanta-message').html('There was a problem initialising the editor.');
			} else {
				$('#zemanta-control').remove(); // does not work via css
			}
		}
	});
});