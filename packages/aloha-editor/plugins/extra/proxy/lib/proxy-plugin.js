/**
 * Aloha Editor Proxy Scripts Plugin
 *
 * This Plugin provides a proxy to request crossdomain resources.
 * Currently there's an implementain in PHP available -- other adapter may follow (ASP, Java, Ruby, Python ...)
 */

/*!
* Aloha Editor
* Author & Copyright (c) 2012 Gentics Software GmbH
* aloha-sales@gentics.com
* Licensed unter the terms of http://www.aloha-editor.com/license.html
*/
/**
 * This Plugin provides a proxy to request crossdomain resources.
 * Currently there's an implementation in PHP available -- other adapter 
 * maybe follow (ASP, Java, Ruby, Python ...).
 */
define(
	['aloha',
	'jquery',
	'aloha/plugin'],
function( Aloha, $, Plugin ) {
	

	return Plugin.create('proxy', {
		adapter: 'php', // currently only php is available

		/**
		 * Called by the plugin-manager on intialization.
		 *
		 * @Override
		 */
		init: function () {
			Aloha.settings.proxy = Aloha.getPluginUrl('proxy') + '/adapter/proxy.' + this.adapter + '?url=';
		}
	});
});
