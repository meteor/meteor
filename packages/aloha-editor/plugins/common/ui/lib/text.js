define([
	"jquery",
	"ui/component"
],
function( jQuery, Component ) {
	/**
	 * Text component type
	 * @class
	 * @extend {Component}
	 */
	var Text = Component.extend({
		/**
		 * Initializes the text component
		 * @override
		 */
		init: function() {
			this._super();
			this.element = jQuery( "<input>" )
				.bind( "change", jQuery.proxy(function( event ) {
					this.setValue( event.target.value );
				}, this ) );
		},

		// invoked when the user has changed the value
		/**
		 * Sets the value of the text field
		 * @param {string} value
		 */
		setValue: function( value ) {}
	});

	return Text;
});
