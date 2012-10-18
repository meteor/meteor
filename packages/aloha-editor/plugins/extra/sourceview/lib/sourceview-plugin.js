/*!
 * Aloha Editor
 * Author & Copyright (c) 2012 Gentics Software GmbH
 * aloha-sales@gentics.com
 * Licensed under the terms of http://www.aloha-editor.com/license.html
 *
 * @overfiew: Provides a development tool for Aloha Editor that shows the
 *            source around the selection inside an editable.
 */
define([
	'aloha',
	'jquery',
	'../../../../test/unit/testutils',
	'../../../../test/unit/htmlbeautifier',
	'css!sourceview/css/sourceview'
], function (Aloha, jQuery, TestUtils) {
	

	var viewArea;

	/**
	 * Given a DOM node, gets that node's index position withing its immediate
	 * parent node.
	 *
	 * @param {DOMObject} node
	 * @return {number} An integer, index of node.
	 */
	function getNodeIndex(node) {
		if (!node) {
			return -1;
		}

		var kids = node.parentNode.childNodes;
		var l = kids.length;
		var i;

		for (i = 0; i < l; ++i) {
			if (kids[i] === node) {
				return i;
			}
		}

		return -1;
	}

	/**
	 * Given a node, and a container node, ensures that node is a child node of
	 * that container, or at least the closest node to its original index.
	 *
	 * @param {HTMLElement} container The container node inwhich to determine
	 *                                the correct child node.
	 * @param {HTMLElement} node A child node of container.
	 * @return {HTMLElement} A node element that is guarenteed to be a child
	 *                       node of the given container node.
	 */
	function getCorrectCloneNode(container, node) {
		var correctNode;

		if (node.nodeType === 3 && container.childNodes.length) {
			var index = getNodeIndex(node);

			if (index >= container.childNodes.length) {
				correctNode = container.lastChild;
			} else {
				correctNode = container.childNodes[index];
			}
		} else {
			correctNode = container;
		}

		return correctNode;
	}

	/**
	 * Renders the source of the given container element, along with its
	 * selection markers as text.
	 *
	 * @param {DOMElement} container
	 */
	function showSource(container) {
		var source = window.style_html(container.html());
		source = Aloha.jQuery('<div>').text(source).html();
		source = source.replace(/ /g, '&nbsp;')
		               .replace(/[\r\n]/g, '<br/>')
		               .replace(/\t/g, '&nbsp;&nbsp;')
		               .replace(/([\[\{])/,
		                  '<span class="aloha-devtool-source-viewer-marker"\
		                     style="background:#70a5e2; color:#fff">$1')
		               .replace(/([\]\}])/, '$1</span>')
		               .replace(/([\[\]\{\}])/g,
		                  '<b style="background:#0c53a4; color:#fff;">$1</b>');
		viewArea.html(source);
		var marker = viewArea.find('.aloha-devtool-source-viewer-marker');

		if (marker.length) {
			// Add rounding at the tip of the selection.
			var radius = 3;
			marker.css('border-radius', radius);
			marker.find('>b').first().css({
				'border-top-left-radius': radius,
				'border-bottom-left-radius': radius
			});
			marker.find('>b').last().css({
				'border-top-right-radius': radius,
				'border-bottom-right-radius': radius
			});

			// Scroll the view to the start of the selection.
			viewArea.scrollTop(0)
			        .scrollTop(Math.max(0, (marker.offset().top -
						viewArea.offset().top) - 30));
		}
	}

	Aloha.Sidebar.right.addPanel({
		id: 'aloha-devtool-source-viewer-panel',
		title: '<span style="float:left; margin-left:20px;">Source Viewer</span>\
					<span style="float:right; padding-right:10px;">\
						<input type="checkbox"\
							   id="aloha-devtool-source-viewer-widen-ckbx"\
							   class="aloha-devtool-source-viewer-ckbx"\
							   style="vertical-align:middle;" />\
						<label for="aloha-devtool-source-viewer-widen-ckbx"\
							   class="aloha-devtool-source-viewer-ckbx">\
							   Widen</label>\
						<input type="checkbox"\
							   id="aloha-devtool-source-viewer-entire-ckbx"\
							   class="aloha-devtool-source-viewer-ckbx"\
							   style="vertical-align:middle;"\
							   checked="true"\
							   />\
						<label for="aloha-devtool-source-viewer-entire-ckbx"\
							   class="aloha-devtool-source-viewer-ckbx">\
							   Show all source</label>\
					</span>\
				<span style="float:clear"></span>',
		expanded: true,
		activeOn: true,
		content: '<div id="aloha-devtool-source-viewer-content"></div>',
		onInit: function () {
			var that = this;
			var showEntireEditableSource = true;
			var sidebar = this.sidebar;
			var originalWidth = sidebar.width;
			viewArea = this.content.find('#aloha-devtool-source-viewer-content');
			this.title.find('.aloha-devtool-source-viewer-ckbx')
				.click(function (ev) {
					ev.stopPropagation();
				});
			this.title.find('#aloha-devtool-source-viewer-widen-ckbx')
				.change(function () {
					sidebar.width = jQuery(this).attr('checked')
						? 600
						: originalWidth;
					sidebar.container.width(sidebar.width)
						.find('.aloha-sidebar-panels').width(sidebar.width);
					sidebar.open(0);
				});
			this.title.find('#aloha-devtool-source-viewer-entire-ckbx')
				.change(function () {
					showEntireEditableSource = !!jQuery(this).attr('checked');
				});

			Aloha.bind('aloha-selection-changed', function (event, range) {
				if (!Aloha.Sidebar.right.isOpen) {
					return;
				}

				var sNode = range.startContainer;
				var eNode = range.endContainer;

				if (!sNode || !eNode) {
					return;
				}

				var id = +(new Date());
				var sClass = 'aloha-selection-start-' + id;
				var eClass = 'aloha-selection-end-' + id;

				// Add marker classes onto the container nodes, or their
				// parentNodes if the containers are textNodes.
				jQuery(sNode.nodeType === 3 ? sNode.parentNode : sNode)
					.addClass(sClass);
				jQuery(eNode.nodeType === 3 ? eNode.parentNode : eNode)
					.addClass(eClass);

				// We determine which element's source to show.  If either the
				// startContainer or the endContainer is a text node, we will
				// want to show more of the source around our selection so we
				// will use the parent node of the commonAncestorContainer.
				var common;

				if (showEntireEditableSource && Aloha.activeEditable &&
						 Aloha.activeEditable.obj) {
					common = Aloha.activeEditable.obj[0];
				} else {
					if ((sNode.nodeType === 3 || eNode.nodeType === 3) &&
							!jQuery(range.commonAncestorContainer)
								.is('.aloha-editable')) {
						common = range.commonAncestorContainer.parentNode;
					} else {
						common = range.commonAncestorContainer;
					}
				}

				if (!common) {
					return;
				}

				var clonedContainer = jQuery(common.outerHTML);
				var clonedStartContainer = clonedContainer.is('.' + sClass)
						? clonedContainer
						: clonedContainer.find('.' + sClass);
				var clonedEndContainer = clonedContainer.is('.' + eClass)
						? clonedContainer
						: clonedContainer.find('.' + eClass);

				// We may not find clonedStart- and clonedEnd- Containers if
				// the selection range is outside of of the active editable
				// (something that can happen when doing CTRL+A).
				if (clonedStartContainer.length === 0 &&
						clonedEndContainer.length === 0) {
					return;
				}

				// Now that we have identified all our containers, we can
				// remove markers anywhere we have placed them.
				jQuery('.' + sClass).removeClass(sClass);
				jQuery('.' + eClass).removeClass(eClass);
				clonedStartContainer.removeClass(sClass);
				clonedEndContainer.removeClass(eClass);
				var startNode = getCorrectCloneNode(clonedStartContainer[0], sNode);
				var endNode = getCorrectCloneNode(clonedEndContainer[0], eNode);
				var fakeRange = {
					startContainer: startNode,
					endContainer: endNode,
					startOffset: range.startOffset,
					endOffset: range.endOffset
				};

				try {
					TestUtils.addBrackets(fakeRange);
				} catch (ex) {
					viewArea.html('[' + ex + ']');
					return;
				}

				showSource(clonedContainer);
			});
		}
	});
});
