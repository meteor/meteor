/* attributes-plugin.js is part of Aloha Editor project http://aloha-editor.org
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
['aloha','aloha/plugin', 'aloha/floatingmenu', 'i18n!attributes/nls/i18n', 'i18n!aloha/nls/i18n', 'css!attributes/css/attributes.css'],
function(Aloha, Plugin, FloatingMenu, i18n, i18nCore) {
	

	var
		jQuery = Aloha.jQuery,
		$ = jQuery,
		GENTICS = window.GENTICS,
		Aloha = window.Aloha;
	
    return Plugin.create('attributes', {
		_constructor: function(){
			this._super('attributes');
		},
		
		// namespace prefix for this plugin
    // Pseudo-namespace prefix
		ns : 'aloha-attributes',
		uid  : 'attributes',
		// namespaced classnames
		nsClasses : {},
    
    
		supplant : function(str, obj) {
			return str.replace(/\{([a-z0-9\-\_]+)\}/ig, function (str, p1, offset, s) {
				var replacement = obj[p1] || str;
				return (typeof replacement == 'function') ? replacement() : replacement;
			});
		},
		
		/**
		 * Wrapper to all the supplant method on a given string, taking the
		 * nsClasses object as the associative array containing the replacement
		 * pairs
		 *
		 * @param {String} str
		 * @return {String}
		 */
		renderTemplate : function(str) {
			return (typeof str === 'string') ? this.supplant(str, this.nsClasses) : str;
		},
		
		/**
		 * Generates a selector string with this component's namepsace prefixed the
		 * each classname
		 *
		 * Usage:
		 *		nsSel('header,', 'main,', 'foooter ul')
		 *		will return
		 *		".aloha-myplugin-header, .aloha-myplugin-main, .aloha-mypluzgin-footer ul"
		 *
		 * @return {String}
		 */
		nsSel : function() {
			var strBldr = [], prx = this.ns;
			$.each(arguments, function () { strBldr.push('.' + (this == '' ? prx : prx + '-' + this)); });
			return strBldr.join(' ').trim();
		},
		
		/**
		 * Generates s string with this component's namepsace prefixed the each
		 * classname
		 *
		 * Usage:
		 *		nsClass('header', 'innerheaderdiv')
		 *		will return
		 *		"aloha-myplugin-header aloha-myplugin-innerheaderdiv"
		 *
		 * @return {String}
		 */
		nsClass : function (){
			var strBldr = [], prx = this.ns;
			$.each(arguments, function () { strBldr.push(this == '' ? prx : prx + '-' + this); });
			return strBldr.join(' ').trim();
		},
		
		config: ['true'],
		
		//activeOn: 'a,span,div,p,q,blockquote,h1,h2,h3,h4,h5,h6,em,i,b',
		
		activeOn : function(effective) {
			if (typeof this.settings.disabled === 'boolean' && this.settings.disabled) {
				return false;
			}
			if (typeof effective != 'undefined' && effective != null) {
				return true;
			}
			return false;
		},
				
		/**
		 * Initialize the plugin
		 */
		init: function () {
			var that = this;
			this.nsClasses = {
				newattributename	: this.nsClass('newattributename'),
				newattributebutton	: this.nsClass('newattributebutton'),
				newattributewert	: this.nsClass('newattributewert'),
				container	: this.nsClass('container'),
				attribcontainer	: this.nsClass('attribcontainer'),
				newattribute	: this.nsClass('newattribute'),
				item	: this.nsClass('item'),
				element	: this.nsClass('element'),
				iteminput	: this.nsClass('iteminput')
			};
			if ( typeof this.settings.activeOn !== 'undefined') {
				this.activeOn = this.settings.activeOn;
			}
			Aloha.ready( function (ev, sidebars) { 
				that.initSidebar(Aloha.Sidebar.right); 
			});
		},
				
		getSidebarContent: function() {
			return this.renderTemplate(
					'<div class="{container}">\
						<h2 id="{element}">Element:</h2>\
						<h2>Vorhandene Attribute</h2>\
						<div class="{attribcontainer}">\
							attribcontainer\
						</div>\
						\
						<div class="{newattribute}">\
						<h2>Neues Attribut</h2>\
						<label for="{newattributename}">Name:</label><input type="text" id="{newattributename}"/>\
						<label for="{newattributewert}">Wert:</label><input type="text" id="{newattributewert}"/>\
						<button id="{newattributebutton}">Hinzuf&uuml;gen</button>\
						</div>\
						\
					</div>'
				);
		},
		
		updateSidebarWithAttributes: function() {
			var that = this;
			var el = this.effective[0];
			var $container = this.content.find(this.nsSel('attribcontainer'));
			$container.html('');
			for (var attr, i=0, attrs=el.attributes, l=attrs.length; i<l; i++){
				attr = attrs.item(i)
				var item = jQuery(this.renderTemplate('<div class="{item}"><label for="{iteminput}'+attr.nodeName+'">'+attr.nodeName+'</label><input id="{iteminput}'+attr.nodeName+'" class="{iteminput}" data-attrname="'+attr.nodeName+'" type="text" value="'+attr.nodeValue+'"/></div>'));
				$container.append(item);
			}
			$container.find(this.nsSel('iteminput')).blur(function(){
				var value = jQuery(this).val();
				var name = jQuery(this).attr('data-attrname');
				
				if (typeof value == 'undefined' || value == '') {
					jQuery(this).parents(that.nsSel('item')).remove();
					pl.correchtHeight();
				} else {
					jQuery(el).attr(name,value);
				}
			});
			var elemheader = this.content.find('#' + this.nsClass('element'));
			elemheader.html("Element: " + el.tagName);
		},
		
		correctHeight: function() {
			this.sidebar.correctHeight();
		},
		
		initSidebar: function(sidebar) {
			var pl = this;
			pl.sidebar = sidebar;
			var sidebarcontent = this.getSidebarContent();
			sidebar.addPanel({
                    
                    id         : pl.nsClass('sidebar-panel'),
                    title     : 'Attribute',
                    content     : '',
                    expanded : true,
                    activeOn : function(ef){return pl.activeOn(ef);},
                    
                    onInit     : function () {
                        var that = this;
                        pl.content = this.setContent(sidebarcontent).content;
                        
                        pl.content.find('#'+pl.nsClass('newattributebutton')).click(function () {
                            var name = jQuery('#'+pl.nsClass('newattributename')).val();
							var wert = jQuery('#'+pl.nsClass('newattributewert')).val();
							jQuery('#'+pl.nsClass('newattributename')).val('');
							jQuery('#'+pl.nsClass('newattributewert')).val('');
							jQuery(pl.effective).attr(name, wert);
							pl.updateSidebarWithAttributes();
							pl.correchtHeight();
                        });
						/*
						content.find(nsSel('reset-button')).click(function () {
                            var content = that.content;
                            pl.processH(that.effective);
							jQuery(that.effective).removeClass('aloha-customized');
							that.content.find(nsSel('input')).val(that.effective.attr('id'));
                        });*/
                    },
                    
                    onActivate: function (effective) {
						var that = this;
						that.effective = effective;
						//DO STUFF HERE
						pl.effective = effective;
						pl.updateSidebarWithAttributes();
						pl.correctHeight();
                    }
                    
                });
		}
	});
});
