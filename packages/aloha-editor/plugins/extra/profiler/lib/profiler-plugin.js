/* profiler-plugin.js is part of Aloha Editor project http://aloha-editor.org
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
/* Aloha Profiler
 * --------------
 * Provides a useful interface to profile some of Aloha components and their
 * methods.
 *
 * Potentially process intensive methods:
 *              Aloha.Profiler.profileAlohaComponent('Markup.preProcessKeyStrokes')
 *              Aloha.Profiler.profileAlohaComponent('Selection._updateSelection')
 */
window.define( [
	'aloha/core',
	'aloha/plugin',
	'aloha/editable',
	// 'aloha/sidebar',
	'aloha/selection',
	'aloha/markup',
	'aloha/contenthandlermanager',
	'aloha/floatingmenu',
	'aloha/console',
	'css!profiler/css/profiler'
], function( Aloha, Plugin, /* Sidebar */ Editable, Selection, Markup,
             ContentHandlerManager, FloatingMenu, console ) {
	// 'caller', 'callee', and 'arguments' properties may not be accessed on
	// strict mode functions or the arguments objects for calls to them
	// 

	var jQuery = Aloha.jQuery,
	    profiledFunctions = [],

	    // get the arguments string literal of this function, and split it into
	    // an array of names
	    argsStr = ( /function[^\(]*\(([^\)]+)/g ).exec( arguments.callee.toString() ),
	    argNames = argsStr ? argsStr[1].replace( /^\s+|\s+$/g, '' ).split( /\,\s*/ ) : [],
	    args = Array.prototype.slice.call( arguments );

	/**
	 * @param {String} path dot seperated path to resolve inside a given object
	 *                 or browser window
	 * @param {?Object} object inwhich to resolve a path. If no object is
	 *                  passed, the browser window object will be used instead
	 * @return {?} Object
	 */
	function resolvePath(path, obj) {
		if ( typeof path !== 'string' ) {
			return path;
		}

		if ( !obj || typeof obj !== 'object' ) {
			obj = window;
		}

		var parts = path.split( '.' ),
		    i = 0,
			j = parts.length;

		for ( ; i < j; ++i ) {
			obj = obj[ parts[ i ] ];
			if ( typeof obj === 'undefined' ) {
				console.error(
					'Aloha.Profiler',
					'Property "' + parts[ i ] + '" does not exist' +
						( i ? ' in object ' + parts.slice( 0, i ).join( '.' ) : '' )
				);

				return null;
			}
		}

		return obj;
	};

	function parseObjectPath( path, obj ) {
		if ( typeof path !== 'string' ) {
			return null;
		}

		var parts = path.split( '.' ),
		    pathToProp = parts.slice( 0, Math.max( 1, parts.length - 1 ) ).join( '.' ),
			prop;

		obj = resolvePath( pathToProp, obj );

		if ( !obj ) {
			return null;
		}

		if ( parts.length > 1 ) {
			var lastProp = parts[ parts.length - 1 ];
			if ( typeof obj[ lastProp ] === 'undefined' ) {
				console.error( 'Aloha.Profiler',
					'Property "' + lastProp + '" does not exist in object ' +
					pathToProp );
			} else {
				prop = lastProp;
			}
		}

		return {
			obj       : obj[ prop ],
			path      : path,
			parentObj : obj,
			propName  : prop
		};
	};

	var panel;
	function initSidebarPanel(sidebar) {
		sidebar.addPanel( {
			id       : 'aloha-devtool-profiler-panel',
			title    : 'Aloha Profiler',
			expanded : true,
			activeOn : true,
			content  : '' +
				'<div id="aloha-devtool-profiler-container">' +
					'<input id="aloha-devtool-profiler-input" ' +
						'value="Aloha.Profiler.profileAlohaComponent(\'Markup.preProcessKeyStrokes\')" />' +
					'<ul id="aloha-devtool-profiler-console"></ul>' +
				'</div>',
			onInit   : function() {
				this.content.find( 'input#aloha-devtool-profiler-input' ).keydown( function( event ) {
					// Handle ENTER
					if ( event.keyCode === 13 ) {
						var input = jQuery( this );
						var value = input.val();
						if ( value ) {
							eval( value );
							PanelConsole.log( value );
							input.val( '' );
						}
					}
				} );
			}
		} );
		sidebar.show().open();
	};
	
	var PanelConsole = {
		log: function() {
			jQuery( '#aloha-devtool-profiler-console' )
				.prepend( '<li>' +
					Array.prototype.slice.call( arguments ).join( ' ' ) +
					'</li>' );
		}
	}

	Aloha.Profiler = Plugin.create( 'profiler', {

		/**
		 * Explose all dependencies to allow easy access. eg:
		 * If the 5th dependency was Markup, then:
		 * Aloha.Profiler.profile(Aloha.Profiler.alohaObjects[4], 'preProcessKeyStrokes')
		 * would start profiling the Markup.preProcessKeyStrokes method.
		 */
		loadedDependencies: Array.prototype.slice.call( arguments ),

		/**
		 * Provides a better interface to access various components of Aloha.
		 * eg: Aloha.Profiler.profile(Aloha.Profiler.alohaComponents[ 'Markup' ], 'preProcessKeyStrokes')
		 */
		alohaComponents: {},
		
		panel: null,

		/**
		 * Initializes Profiler plugin by populating alohaComponents with all
		 * arguments of our define function, mapping name, to object
		 */
		init: function() {
			var j = argNames.length;
			while ( --j >= 0 ) {
				this.alohaComponents[ argNames[ j ] ] = args[ j ];
			}
			
			var that = this;
			
			Aloha.ready( function() {
				if ( Aloha.Sidebar && Aloha.Sidebar.right ) {
					that.panel = initSidebarPanel( Aloha.Sidebar.right );
				}
			} );
		},

		log: function() {
			PanelConsole.log.apply( PanelConsole, arguments );
		},

		/**
		 * Shortcut to profile one of the Aloha components that was required by
		 * Aloha Profiler.
		 *
		 * @param {String} path
		 * @param {String} fnName
		 */
		profileAlohaComponent: function( path, fnName ) {
			var parts = parseObjectPath( path, this.alohaComponents );
			return this.profile( parts.parentObj, fnName || parts.propName );
		},

		/**
		 * @param {(Object|String)} obj object or path to object that contains
		 *                 the function we want to profile. Or the path to the
		 *                 function itself
		 * @param {String} fnName name of function inside obj, which we want to
		 *                 profile
		 * @param {?Function(Function, Array):Boolean} intercept functiont to
		 *                 call each time this method is invoked
		 */
		profile: function( obj, fnName, intercept ) {
			var path,
			    parts,
			    objIndex = -1,
			    i;

			if ( typeof obj === 'string' ) {
				parts = parseObjectPath( obj );
				obj = parts.parentObj;
				path = parts.path + ( fnName ? '.' + fnName : '' );
				if ( parts.propName ) {
					if ( typeof parts.obj === 'function' ) {
						fnName = parts.propName;
					} else if ( parts.obj === 'object' ) {
						obj = parts.obj;
					}
				}
			}

			if ( !obj || !fnName || typeof obj[ fnName ] !== 'function' ) {
				return;
			}

			for ( i = 0; i < profiledFunctions.length; ++i ) {
				if ( profiledFunctions[ i ] === obj ) {
					objIndex = i;
					if ( profiledFunctions[ i ][ fnName ] ) {
						return;
					}
				}
			}

			var fn = obj[ fnName ];
			var that = this;

			// In IE typeof window.console.log returns "object!!!"
			if ( window.console && window.console.log ) {
				if ( objIndex === -1 ) {
					objIndex = profiledFunctions.push( obj ) - 1;
				}

				profiledFunctions[ objIndex ][ fnName ] = fn;

				obj[ fnName ] = function() {
					if ( typeof intercept === 'function' ) {
						intercept( fn, arguments );
					}

					// window.console.time( fnName );
					var start = +( new Date() );
					var returnValue = fn.apply( obj, arguments );

					// window.console.timeEnd( fnName );
					that.log( ( path || fnName ) + ': ' +
						( ( new Date() ) - start ) + 'ms' );

					return returnValue;
				};
			}
		},

		/**
		 * @return {String} "Aloha.Profiler"
		 */
		toString: function() {
			return 'Aloha.Profiler';
		}
	} );

	return Aloha.Profiler;
} );
