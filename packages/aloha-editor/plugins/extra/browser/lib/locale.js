/**
 * In order to choose the correct internationalization for among the
 * grid.locale.{lang} files, we will manually require each of these
 * grid.locale.* files (where * is the language code of the locale). These
 * files have each been slightly modified to no longer extend Aloha.jQuery with
 * a "jgrid" object, but rather a jgrid_* object. So instead of the jQuery
 * object having a single "jgrid" object, it will have several objects with
 * names like "jgrid_en", and "jgrid_de".
 * In order to determine which of these i18n objects should be used with the
 * browser, we read a "jgrid.locale" key from the i18n.js file in browser/nls,
 * an use this value to choose which of the jgrid_* objects, Aloha.jQuery.jgrid
 * should point to
 */
define( [
	'aloha/jquery',
	'i18n!browser/nls/i18n',
	'browser/../vendor/grid.locale.en',
	'browser/../vendor/grid.locale.de'
], function ( jQuery, i18n ) {
	var locale = i18n[ 'jgrid.locale' ] || 'en';
	if ( typeof jQuery.jgrid == 'undefined' ) {
		jQuery.jgrid = {};
	}
	jQuery.extend( jQuery.jgrid, jQuery[ 'jgrid_' + locale ] );
	jQuery.jgrid_en = jQuery.jgrid_de = void 0;
} );