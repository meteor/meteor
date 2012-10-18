/**
 * Captioned Image provides an Aloha block implementation that allows the editor
 * to work with images that have captions, such that an image with its
 * corresponding caption can be aligned together in an editable.
 * It reads and writes to an <img> tag's data-caption and data-align attributes.
 * No formatting inside the caption is allowed; only plain text is permitted.
 * Four possible alignments are possible: none, left, right, center.
 *
 * TODO
 * ----
 * - Implement makeClean
 * - Prevent disallowed content in caption
 */
define([
	'jquery',
	'aloha/core',
	'aloha/plugin',
	'block/block',
	'block/blockmanager',
	'ui/ui',
	'ui/toggleButton',
	'ui/toolbar',
	'util/maps',
	'aloha/contenthandlermanager',
	'aloha/console',
	'align/align-plugin', // Needed to ensure that we have "alignLeft", and
	                      // "alignRight" components.
	// FIXME: use of the css require plugin is deprecated
	'css!captioned-image/css/captioned-image.css'
], function (
	$,
	Aloha,
	Plugin,
	Block,
	BlockManager,
	Ui,
	ToggleButton,
	Toolbar,
	Maps,
	ContentHandlerManager,
	console
) {
	

	var defaultRenderCSS = '\
		.captioned-image {\
			text-align: center;\
			padding: 0 1em 1em;\
		}\
		.captioned-image.align-right {\
			float: right;\
			padding-right: 0;\
		}\
		.captioned-image.align-left {\
			float: left;\
			padding-left: 0;\
		}\
		.captioned-image.align-center {\
			display: block;\
			text-align: center;\
		}\
		.captioned-image .caption {\
			padding: 0.5em;\
			font-size: 0.9em;\
			background: rgba(0,0,0,0.8);\
			font-family: Arial;\
			color: #fff;\
			text-align: left;\
			min-width: 100px;\
		}\
		.captioned-image.align-center .caption {\
			margin-left: auto;\
			margin-right: auto;\
		}\
		/* Overrides for when the caption is being edited through Aloha Editor. */\
		.aloha-captioned-image-block .captioned-image {\
			padding: 0;\
		}\
	';

	var settings = ((Aloha.settings &&
	               Aloha.settings.plugins &&
	               Aloha.settings.plugins.captionedImage) || false);

	if (settings.defaultCSS !== false) {
		$('<style type="text/css">').text(defaultRenderCSS).appendTo('head:first');
	}

	var render;
	if (typeof settings.render === 'function') {
		render = settings.render;
	} else {
		render = function (variables, callback, error) {
			var html = '<div class="captioned-image';

			if (variables.align) {
				html += ' align-' + variables.align;
			}

			html += '">'
				 + (variables.image || '<img alt="Captioned image placeholder"/>')
				 + '<div class="caption"';

			if (variables.width) {
				html += ' style="width:' + variables.width + '"';
			}

			html += '>' + (variables.caption || '') + '</div></div>';

			callback({
				content: html,
				image: '>div>img:first',
				caption: '>div>div.caption:first'
			});
		};
	}

	// This is the class that will be set on the image when cleaning up. Set to
	// the empty string if you don't want a class to be set.
	if (typeof settings.captionedImageClass !== 'string') {
		settings.captionedImageClass = 'aloha-captioned-image';
	}

	var components = [];
	function initializeComponents() {
		var left = Ui.getAdoptedComponent('alignLeft');
		var right = Ui.getAdoptedComponent('alignRight');
		var center = Ui.getAdoptedComponent('alignCenter');
		var alignLeft = function () {
			center.setState(false);
			right.setState(false);
			if (BlockManager._activeBlock) {
				var alignment = BlockManager._activeBlock.attr('align');
				BlockManager._activeBlock.attr('align',
					('left' === alignment) ? 'none' : 'left');
				return true;
			}
			return false;
		};
		var alignRight = function () {
			left.setState(false);
			center.setState(false);
			if (BlockManager._activeBlock) {
				var alignment = BlockManager._activeBlock.attr('align');
				BlockManager._activeBlock.attr('align',
					('right' === alignment) ? 'none' : 'right');
				return true;
			}
			return false;
		};
		var alignCenter = function () {
			left.setState(false);
			right.setState(false);
			if (BlockManager._activeBlock) {
				BlockManager._activeBlock.attr('align', 'center');
				return true;
			}
			return false;
		}

		if (left) {
			var clickLeft = left.click;
			left.click = function () {
				if (!alignLeft()) {
					clickLeft();
				}
			};
			components.push(left);
		} else {
			components.push(Ui.adopt('imgAlignLeft', ToggleButton, {
				tooltip: 'Align left',
				text: 'Align left',
				click: alignLeft
			}));
		}

		if (right) {
			var clickRight = right.click;
			right.click = function () {
				if (!alignRight()) {
					clickRight();
				}
			};
			components.push(right);
		} else {
			components.push(Ui.adopt('imgAlignRight', ToggleButton, {
				tooltip: 'Align right',
				text: 'Align right',
				click: alignRight
			}));
		}

		if (center) {
			var clickCenter = center.click;
			center.click = function () {
				if (!alignCenter()) {
					clickCenter();
				}
			};
			components.push(center);
		} else {
			components.push(Ui.adopt('imgAlignCenter', ToggleButton, {
				tooltip: 'Align center',
				text: 'Align center',
				click: alignCenter
			}));
		}

		components.push(Ui.adopt('imgAlignClear', ToggleButton, {
			tooltip: 'Remove alignment',
			text: 'Remove alignment',
			click: function () {
				if (BlockManager._activeBlock) {
					BlockManager._activeBlock.attr('align', 'none');
				}
			}
		}));
	}

	function getImageWidth($img) {
		var width;

		if (typeof $img.attr('width') !== 'undefined') {
			width = parseInt($img.attr('width'), 10);
		} else {
			// NOTE: this assumes the image has already loaded!
			width = parseInt($img.width(), 10);
		}

		if (typeof width === 'number' && !isNaN(width)) {
			width += 'px';
		} else {
			width = 'auto';
		}

		return width;
	}

	var blockAlignment = {};

	function getAlignmentButton(alignment) {
		switch (alignment) {
		case 'left':
			return Ui.getAdoptedComponent('alignLeft');
		case 'center':
			return Ui.getAdoptedComponent('alignCenter');
		case 'right':
			return Ui.getAdoptedComponent('alignRight');
		}
		return null;
	}

	function showComponents() {
		var i;
		for (i = 0; i < components.length; i++) {
			components[i].visible = false; // Force the component to be shown.
			components[i].show();
			components[i].foreground();
		}

		if (!Aloha.activeEditable || !BlockManager._activeBlock) {
			return;
		}

		for (i = 0; i < components.length; i++) {
			components[i].setState(false);
		}

		var alignment = BlockManager._activeBlock.attr('align');
		var component = getAlignmentButton(alignment);

		if (component) {
			component.setState(true);
		}
	}

	function eachBlock($context, fn) {
		var $blocks = $context.find('.aloha-captioned-image-block');
		$blocks.each(function (i, blockElem) {
			var block = BlockManager.getBlock(blockElem);
			if (block) {
				return fn(block, blockElem);
			}
		});
	}

	function cleanBlock(block, blockElem) {
		var $img = block.$_image.clone();
		var caption = block.attr('caption');
		var align = block.attr('align');

		// We only touch the data-caption and data-align attributes o/t img!
		if (caption) {
			$img.attr('data-caption', caption);
		} else {
			$img.removeAttr('data-caption');
		}

		if (align) {
			$img.attr('data-align', align);
		} else {
			$img.removeAttr('data-align');
		}

		if (settings.captionedImageClass) {
			$img.addClass(settings.captionedImageClass);
		}

		// Now replace the entire block with the original image, with
		// potentially updated data-caption, data-align and class
		// attributes.
		$(blockElem).replaceWith($img);
	}

	function cleanEditable($editable) {
		eachBlock($editable, function (block, blockElem) {
			cleanBlock(block, blockElem);
		});
	}

	function wrapNakedCaptionedImages($editable) {
		var selector = settings.selector || 'img.aloha-captioned-image';
		var $imgs = $editable.find(selector);
		var j = $imgs.length;

		while (j--) {
			var $img = $imgs.eq(j);
			var $block = $img.removeClass(settings.captionedImageClass)
							 .wrap('<div class="aloha-captioned-image-block">')
							 .parent();

			// Set user-provided block class, if any.
			if (typeof settings.blockClass === 'string') {
				$block.addClass(settings.blockClass);
			}

			// Through this plug-in, users will be able to change the caption
			// and the alignment, so we only need to grab those two attributes,
			// as well as the original image. We'll then always manipulate the
			// original image, to make sure we don't accidentally erase other
			// attributes.
			// Whenever we need to use other attributes, we'll have to retrieve
			// it from the original image.
			var caption = $img.attr('data-caption');
			var align = $img.attr('data-align');
			caption = (typeof caption !== 'undefined') ? caption : '';
			align = (typeof align !== 'undefined') ? align : false;
			$block.attr('data-caption',        caption)
			      .attr('data-align',          align)
			      .attr('data-width',          getImageWidth($img))
			      .attr('data-original-image', $img[0].outerHTML);
		}

		return $editable.find('.aloha-captioned-image-block');
	}

	function initializeImageBlocks($editable) {
		var $all = wrapNakedCaptionedImages($editable);
		var $blocks = $();
		var j = $all.length;

		// Transform all of the captioned (or captionable!) images into Aloha
		// Blocks.
		while (j--) {
			if (!$all.eq(j).hasClass('aloha-block')) {
				$blocks = $blocks.add($all[j]);
			}
		}

		// Set the block type for these new Aloha Blocks to the right type.
		$blocks.alohaBlock({
			'aloha-block-type': 'CaptionedImageBlock'
		});
	}

	var CaptionedImageBlock = Block.AbstractBlock.extend({
		title: 'Captioned Image',
		onblur: null,
		$_image: null,
		$_caption: null,
		init: function ($element, postProcessCallback) {
			if (this._initialized) {
				return;
			}

			var that = this;

			this.onblur = function () {
				var html = that.$_caption.html();

				if (that.attr('caption') !== html) {
					that.attr('caption', html);
				}

				Toolbar.$surfaceContainer.show();
			};

			this.onkeypress = function(e) {
				// prevent new line in image caption -- no p and br allowed (default)
				//
				// use Aloha.settings.plugins.captionedImage.allowLinebreak = false (or an empty array [ ]) (default)
				// to allow no <br> and <p>
				//
				// use Aloha.settings.plugins.captionedImage.allowLinebreak = ['p', 'br'] to allow <br> and <p>
				// use Aloha.settings.plugins.captionedImage.allowLinebreak = [ 'br' ] to allow just <br> and not <p> (or boolean true)
				// use Aloha.settings.plugins.captionedImage.allowLinebreak = [ 'p' ] to allow just <p>
				var allowLinebreak = false,
					allowNewline = false;

				if (settings &&
					typeof settings.allowLinebreak != 'undefined' &&
					settings.allowLinebreak) {
					allowNewline = true;
					allowLinebreak = settings.allowLinebreak;
				}

				if (settings.allowLinebreak === true) {
					allowLinebreak = [ 'br' ];
				}

				if (jQuery.inArray('p', allowLinebreak) < 0 && jQuery.inArray('br', allowLinebreak) < 0) {
					allowNewline = false;
				}

				if (e.keyCode == 13 && !allowNewline) {
					console.info(this.title, 'No new line or paragraph allowed in image caption. Use: "Aloha.settings.plugins.captionedImage.allowLinebreak = true" to activate.');
					e.preventDefault();
				} else {
					if ((event.shiftKey && jQuery.inArray('br', allowLinebreak) >= 0) ||
						(!event.shiftKey && jQuery.inArray('p', allowLinebreak) < 0)) {
						Aloha.execCommand( 'insertlinebreak', false );
						return false;
					} else if (jQuery.inArray('p', allowLinebreak) >= 0) {
						Aloha.execCommand( 'insertparagraph', false );
						return false;
					}
				}
			};

			render({
				image  : this.attr('original-image'),
				caption: this.attr('caption'),
				align  : this.attr('align'),
				width  : this.attr('width')
			}, function (data) {
				that._processRenderedData(data);
				postProcessCallback();

				Aloha.bind('aloha-editable-activated', function ($event, data) {
					if (data.editable.obj.is(that.$_caption)) {
						Toolbar.$surfaceContainer.hide();

						// add the key handler for enter (no new line allowed in caption)
						Aloha.Markup.addKeyHandler(13, function($event) {
							return that.onkeypress($event);
						});

					}
				});

				Aloha.bind('aloha-editable-deactivated', function ($event, data) {
					//if (data.editable.obj.is(that.$_caption)) {
						// this should work like above at aloha-editable-activated,
						// but it seems there is a proplem in the block implementation / this plugin
						// when iteracting with the caption editable aloha-editable-(de)activated
						// is triggerd 3 times (because there are 3 captioned image block in the main editable)
						// when just activate / deactivate the caption it works with fine (that.$_caption is available for all 3) but
						// when you change the text of the caption and deactivate it that.$_caption is 3 times the same,
						// it's the first caption editable (but this one was not the one I (de)activated)

						// the implementation of Aloha.Markup.addKeyHandler is at the moment ok,
						// but should be improved so that it's possible to bind it to a specific editable
						// right now addKeyHandler is just used here and in the list plugin
						// there is already an issue in the tracker recommending using the hotkey plugin also here
						// we need to discuss this topic ...

						// remove the key handler for enter
						Aloha.Markup.removeKeyHandler(13);
					//}
				});

			}, function (error) {
				postProcessCallback();
			});
		},
		update: function ($element, postProcessCallback) {
			this.$_caption.unbind('blur', this.onblur);
			var that = this;
			render({
				image  : this.attr('original-image'),
				caption: this.attr('caption'),
				align  : this.attr('align'),
				width  : this.attr('width')
			}, function (data) {
				that._processRenderedData(data);
				postProcessCallback();
			}, function (error) {
				postProcessCallback();
			});
		},
		_processRenderedData: function (data) {
			this.$element.html(data.content);
			this.$_image = this.$element.find(data.image);
			this.$_caption = this.$element.find(data.caption);
			this.$_caption.addClass('aloha-captioned-image-caption')
			              .addClass('aloha-editable')
			              .bind('blur', this.onblur);
			this.$element.removeClass('align-left align-right align-center');
			var alignment = this.attr('align');

			if (alignment) {
				this.$element.addClass('align-' + alignment);
			}

			// Indicate which CaptionedImage blocks have an empty caption, so
			// we can hide their caption areas whenever these blocks are not
			// active.
			if (this.attr('caption')) {
				this.$element.removeClass('aloha-captioned-image-block-empty-caption');
			} else {
				this.$element.addClass('aloha-captioned-image-block-empty-caption');
			}
		}
	});

	var CaptionedImage = Plugin.create('captioned-image', {
		init: function () {
			initializeComponents();
			BlockManager.registerBlockType('CaptionedImageBlock', CaptionedImageBlock);
			var j = Aloha.editables.length;
			while (j--) {
				initializeImageBlocks(Aloha.editables[j].obj);
			}

			Aloha.bind('aloha-editable-created', function ($event, editable) {
				initializeImageBlocks(editable.obj);
				editable.obj.delegate('.aloha-captioned-image-block', 'click',
					showComponents);
			});
			Aloha.bind('aloha-editable-destroyed', function ($event, editable) {
				eachBlock(editable.obj, function (block, blockElem) {
					cleanBlock(block, blockElem);
					block.free();
				});
				editable.obj.undelegate('.aloha-captioned-image-block', 'click',
					showComponents);
			});
		},
		makeClean: function ($content) {
			cleanEditable($content);
		}
	});

	return CaptionedImage;
});
