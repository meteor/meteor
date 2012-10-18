/* undo-plugin.js is part of Aloha Editor project http://aloha-editor.org
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
['aloha', 'jquery', 'aloha/plugin', 'undo/vendor/undo', 'undo/vendor/diff_match_patch_uncompressed'],
function( Aloha, jQuery, Plugin) {
	
	var
	    dmp = new diff_match_patch,
	    resetFlag = false;

	function reversePatch(patch) {
		var reversed = dmp.patch_deepCopy(patch);
		for (var i = 0; i < reversed.length; i++) {
			for (var j = 0; j < reversed[i].diffs.length; j++) {
				reversed[i].diffs[j][0] = -(reversed[i].diffs[j][0]);
			}
		}
		return reversed;
	}

	/**
	 * register the plugin with unique name
     */
	return Plugin.create('undo', {
		/**
		 * Initialize the plugin and set initialize flag on true
		 */
		init: function () {

			var stack = new Undo.Stack(),
			    EditCommand = Undo.Command.extend({
					constructor: function(editable, patch) {
						this.editable = editable;
						this.patch = patch;
					},
					execute: function() {
						//command object is created after execution.
					},
					undo: function() {
						this.phase(reversePatch(this.patch));
					},
					redo: function() {
						this.phase(this.patch);
					},
					phase: function(patch) {
						var contents = this.editable.getContents(),
						    applied = dmp.patch_apply(patch, contents),
						    newValue = applied[0],
						    didNotApply = applied[1];
						if (didNotApply.length) {
							//error
						}
						this.reset(newValue);
					},
					reset: function(val) {
						//we have to trigger a smartContentChange event
						//after doing an undo or redo, but we mustn't
						//push new commands on the stack, because there
						//are no new commands, just the old commands on
						//the stack that are undone or redone.
						resetFlag = true;

						var reactivate = null;
						if (Aloha.getActiveEditable() === this.editable) {
							Aloha.deactivateEditable();
							reactivate = this.editable;
						}

						this.editable.obj.html(val);

						if (null !== reactivate) {
							reactivate.activate();
						}

						//TODO: this is a call to an internal
						//function. There should be an API to generate
						//new smartContentChangeEvents.
						this.editable.smartContentChange({type : 'blur'});

						resetFlag = false;
					}
				});

			stack.changed = function() {
				// update UI
			};

			// @todo use aloha hotkeys here
			jQuery(document).keydown(function(event) {
				if (!event.metaKey || event.keyCode != 90) {
					return;
				}
				event.preventDefault();

				//Before doing an undo, bring the smartContentChange
				//event up to date.
				if ( null !== Aloha.getActiveEditable() ) {
					Aloha.getActiveEditable().smartContentChange({type : 'blur'});
				}

				if (event.shiftKey) {
					stack.canRedo() && stack.redo();
				} else {
					stack.canUndo() && stack.undo();
				}
			});

			Aloha.bind('aloha-smart-content-changed', function(jevent, aevent) {
				if (resetFlag) {
					return;
				}
				var oldValue = aevent.getSnapshotContent(),
				    newValue = aevent.editable.getContents(),
				    patch = dmp.patch_make(oldValue, newValue);
				// only push an EditCommand if something actually changed.
				if (0 !== patch.length) {
					stack.execute( new EditCommand( aevent.editable, patch ) );
				}
			});
		},


		/**
		 * toString method
		 * @return string
		 */
		toString: function () {
			return 'undo';
		}

	});
});
