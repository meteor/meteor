/* dragndropfiles.js is part of Aloha Editor project http://aloha-editor.org
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
//(function(window, undefined) {
//    var
//        $ = jQuery = window.alohaQuery || window.jQuery,
//        GENTICS = window.GENTICS,
//        Aloha = GENTICS.Aloha;
define([	
	'jquery',
	'aloha/plugin',
	'draganddropfiles/dropfilesrepository'
	],
function($, Plugin,DropFilesRepository) {
	
	var jQuery = $,
	    GENTICS = window.GENTICS,	Aloha = window.Aloha;
	return Plugin.create('draganddropfiles', {
		/**
		 * Configure the available languages
		 */
		languages:['en','fr'],
		/**
		 * Default config, each editable may have his own stuff.
		 */
		config: {'max_file_size': 300000,
			'max_file_count': 2,
			'upload': {
				'uploader_instance':new DropFilesRepository('draganddropfilesrepository','Dropped Files'),
				'config': {
					'callback': function(resp) { return resp;}, // what to do with the server response, must return the new file location,
																//  if server return an error, throws an exception (throw "error")
					'method':'POST',
					'url': "",
					'accept': 'application/json',
					'file_name_param':"filename",
					'file_name_header':'X-File-Name',
					'extra_headers':{}, //Extra parameters
					'extra_post_data': {}, //Extra parameters
					'send_multipart_form': false, //true for html4 TODO: make browser check
					'image': {
						'max_width': 800,
						'max_height': 800
				},
				//'additional_params': {"location":""},
				'www_encoded': false
				}
			}
		},
		/**
		 * Add a drop listener to the body of the whole document
		 */
		init: function() {
			var that = this;
				// add the listener
				that.setBodyDropHandler();
	//			stylePath = GENTICS_Aloha_base + '/plugins/com.gentics.aloha.plugins.DragAndDropFiles/style.css';
	//			jQuery('head').append('<link rel="stylesheet" href="'
	//					+ stylePath + '"></script>');
				if (that.settings === undefined) {
					that.settings = that.config;
				} else {
					that.settings = jQuery.extend(true, that.config, that.settings);
				}

				try {
					that.uploader = that.initUploader(that.settings);
				} catch(error) {
					Aloha.Log.warn(that,error);
					Aloha.Log.warn(that,"Error creating uploader, no upload will be processed");
				}
			Aloha.bind('aloha-file-upload-prepared', function(event, data) {
				if (that.droppedFilesCount >= that.processedFiles) {
					Aloha.trigger('aloha-allfiles-upload-prepared');
				}
				
			});
			Aloha.bind('aloha-allfiles-upload-prepared', function(event, data) {
				var len = that.filesObjs.length;
				if (that.dropInEditable) {
					Aloha.trigger('aloha-drop-files-in-editable', {
						'filesObjs':that.filesObjs,
						'range': that.targetRange,
						'editable': that.targetEditable});
					var edConfig = that.getEditableConfig(that.targetEditable);
					while(--len >= 0) {
						that.uploader.startFileUpload(that.filesObjs[len].id,edConfig.upload.config);
					}
				} else {
					Aloha.trigger('aloha-drop-files-in-page', that.filesObjs);
					while(--len >= 0) {
						that.uploader.startFileUpload(that.filesObjs[len].id,that.config.upload.config);
					}
				}
			});
		},
		
		/**
		 * Init a custom uploader
		 */
		initUploader: function(customConfig) {
			var
				uploader_instance;
			try {
				uploader_instance = customConfig.upload.uploader_instance;
			} catch(error) {
				Aloha.Log.info(this,"Custom class loading error or not specified, using default");
				uploader_instance = new DropFilesRepository('draganddropfilesrepository','Dropped Files');
//				if (customConfig.upload.delegate) {
//					uploader_instance.delegateUploadEvent = customConfig.upload.delegate;
//				}
			}
			return uploader_instance;
		},
		/**
		 * Prepare upload
		 */
		prepareFileUpload: function(file) {
			var 
				reader = new FileReader(),
				fileObj,
				that = this;
			reader.file = file;
            reader.onloadend = function() {
                var currentFile = {
                    name: this.file.name,
                    type: this.file.type,
                    fileSize: this.file.fileSize,
                    fileName: this.file.fileName,
                    data: reader.result
                };
                that.filesObjs.push(that.uploader.addFileUpload(currentFile));
                that.processedFiles++;
                Aloha.trigger('aloha-file-upload-prepared',fileObj);
            };
            reader.readAsDataURL(file);
		},
		/**
		 * Our drop event Handler
		 */
		dropEventHandler: function(event) {
			var 
				that = this, edConfig, len, target,
				files = event.dataTransfer.files, dropimg;
			this.targetEditable = undefined;
			this.droppedFilesCount = files.length;
			this.processedFiles = 0;
			Aloha.Log.info(that, this.droppedFilesCount + " files have been dropped on the page");
			
//			if (jQuery.browser.msie) {
//				var textdata = event.dataTransfer.getData('Text');
//				var urldata = event.dataTransfer.getData('URL');
//				var imagedataW = window.event.dataTransfer.getData('URL');
//				var textdataW = window.event.dataTransfer.getData('Text');
//				var x = textdataW;
//			}
			// if no files where dropped, use default handler
			if (!event.dataTransfer && !event.dataTransfer.files) {
				event.sink = false;
				return true;
			}
			if (this.droppedFilesCount < 1) {
				event.sink = false;
				return true;
			}
			if (event.preventDefault) {
				event.preventDefault();
			} else {
				event.cancelBubble = true;
			}
			if (this.droppedFilesCount > that.settings.max_file_count) {
				Aloha.Log.warn(that,"too much files dropped");
				if (event.stopPropagation) {
					event.stopPropagation();
				} else {
					event.returnValue = false;
				}
				return true;
			}
			target = jQuery(event.target);
			//If drop in editable
			if (target.hasClass('aloha-editable')) {
				this.targetEditable = target;
				target = this.targetEditable.children(':last');
				if (target.hasClass('aloha-editable')) {
					//nested space is needed in this tag, otherwise select won't success...
					this.targetEditable.append('<span> </span>');
					target = this.targetEditable.children(':last');
				}
			} else {
				this.targetEditable = target.parents('.aloha-editable');
			}
			this.filesObjs = [];
			this.dropInEditable = false;
			len = this.droppedFilesCount;
			if (this.targetEditable[0] === null) { // Process files out of editables
				while(--len >= 0) {
					if  ( // Set of conditions, can we resize the image, and do we have a conf to do it
							!(!!document.createElement('canvas').getContext &&
							  files[len].type.match(/image\//) &&
							  edConfig.upload.config.image)
						) {
						if (files[len].size <= that.settings.max_file_size) {
							that.prepareFileUpload(files[len]);
						} else {
							this.processedFiles++;
							Aloha.Log.warn(that,"max_file_size exeeded, upload of " + files[len].name + " aborted");
						}
					} else {
						that.prepareFileUpload(files[len]);
					}
				}
			} else {
				Aloha.getEditableById(this.targetEditable.attr('id')).activate();
				that.targetRange = that.initializeRangeForDropEvent(event, this.targetEditable);
				edConfig = that.getEditableConfig(this.targetEditable);
				edConfig.upload = $.extend({},edConfig.upload,that.settings.upload);
				if (edConfig) {
					that.dropInEditable = true;
				}
				while(--len >= 0) {
					try {
						dropimg = edConfig.upload.config.image;
					} catch (e) {
						dropimg = false;
					}
					if  ( // Set of conditions, can we resize the image, and do we have a conf to do it
							!(!!document.createElement('canvas').getContext &&
							  files[len].type.match(/image\//) &&
							  dropimg)
						) {
						if (files[len].size <= edConfig.max_file_size) {
							that.prepareFileUpload(files[len]);
						} else {
							this.processedFiles++;
							Aloha.Log.warn(that,"max_file_size exeeded, upload of " + files[len].name + " aborted");
						}
					} else {
						that.prepareFileUpload(files[len]);
					}
				} //while
			}
			
			if (event.stopPropagation) {
				event.stopPropagation();
			} else {
				event.returnValue = false;
			}
			return false;
		},
		/**
		 *  Attach drag and drop listeners to document body (Native JS way)
		 *
		 */
		setBodyDropHandler: function() {
			var that = this;
			if (!document.body.BodyDragSinker){
				document.body.BodyDragSinker = true;
				this.onstr = "";
				this.mydoc = document;
				this.methodName = "addEventListener";
				if (jQuery.browser.msie) {
					this.onstr = "on";
					this.methodName = "attachEvent";
					this.mydoc = document.body;
				}

				// sets the default handler
				this.mydoc[this.methodName](this.onstr+"drop", function(event) {that.dropEventHandler(event)} , false);
			// TODO: improve below to allow default comportment behaviour if drop event is not a files drop event
			this.mydoc[this.methodName](this.onstr+"dragenter", function(event) {
				if (event.preventDefault)
					event.preventDefault();
				else
					event.cancelBubble = true;
				if (event.stopPropagation)
					event.stopPropagation();
				else
					event.returnValue = false;
				return false;
			}, false);
			this.mydoc[this.methodName](this.onstr+"dragleave", function(event) {
				if (event.preventDefault)
					event.preventDefault();
				else
					event.cancelBubble = true;
				if (event.stopPropagation)
					event.stopPropagation();
				else
					event.returnValue = false;
				return false;
			}, false);
			this.mydoc[this.methodName](this.onstr+"dragover", function(event) {
				if (event.preventDefault)
					event.preventDefault();
				else
					event.cancelBubble = true;
				if (event.stopPropagation)
					event.stopPropagation();
				else
					event.returnValue = false;
				//return false;
			}, false);



			} // if
			// end body events
			//==================
		},
		
		/**
		 * TODO do we realy need a range Object? May be it makes sense to attach it to the event
		 * for plugin developers comfort.
		 */
		initializeRangeForDropEvent: function(event, editable) {
			//var range = new GENTICS.Utils.RangeObject();
			var target = jQuery(event.target);
//			if (target.textNodes().length == 0 && target.html().length == 0) {
//				target.html(" ");
//			}
			var	range = new Aloha.Selection.SelectionRange(true);
			range.update();
			if (target.textNodes().length == 0) {
				range.startContainer = target[0].childNodes[0];
				range.endContainer = target[0].childNodes[0];
			} else {
				range.startContainer = target.textNodes()[0];
				range.endContainer = target.textNodes()[0];
			}
		//
				range.startOffset = 0;
				range.endOffset = 0;
			try {
				range.select();
			} catch (error) {
				Aloha.Log.error(this,error);
			}
			return range;
		}
		
	});
});