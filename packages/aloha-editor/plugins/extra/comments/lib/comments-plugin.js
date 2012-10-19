/* comments-plugin.js is part of Aloha Editor project http://aloha-editor.org
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
// TODO: SHIFT + ENTER => submit comment  |

define(
['aloha', 'aloha/plugin', 'jquery', 'aloha/floatingmenu', 'i18n!format/nls/i18n', 'i18n!aloha/nls/i18n', 'aloha/console',
 		'css!format/css/format.css'],
function(Aloha, Plugin, jQuery, FloatingMenu, i18n, i18nCore) {
	

	
	var  jQuery	= window.alohaQuery || window.jQuery,
			  $ = jQuery,
		GENTICS = window.GENTICS,
		  Aloha	= window.Aloha;
	
	$.extend($.easing, {
		easeOutExpo: function (x, t, b, c, d) {
			return (t==d) ? b+c : c * (-Math.pow(2, -10 * t/d) + 1) + b;
		},
		easeOutElastic: function (x, t, b, c, d) {
			var s=1.70158;var p=0;var a=c;
			if (t==0) return b;  if ((t/=d)==1) return b+c;  if (!p) p=d*.3;
			if (a < Math.abs(c)) { a=c; var s=p/4; }
			else var s = p/(2*Math.PI) * Math.asin (c/a);
			return a*Math.pow(2,-10*t) * Math.sin( (t*d-s)*(2*Math.PI)/p ) + c + b;
		}
	});
	
	var dom_util = GENTICS.Utils.Dom,
		clss = 'aloha-comments',
		uid = +(new Date),
		add_box = $(
			'<div class="' + clss + '-addbox">' +
				'<div class="' + clss + '-content">' +
					'<h2>Comment:</h2>' +
					'<input class="' + clss + '-user" value="" />' +
					'<div class="' + clss + '-user-err-msg"></div>' +
					'<textarea></textarea>' +
					'<div class="' + clss + '-text-err-msg"></div>' +
					'<ul class="' + clss + '-colors"></ul>' +
					'<button class="' + clss + '-cancel ' + clss + '-btn">Cancel</button>' +
					'<button class="' + clss + '-submit ' + clss + '-btn">Comment</button>' +
					'<div class="' + clss + '-clear"></div>' +
				'</div>' +
				'<div class="' + clss + '-arrow">' +
					'<div class="' + clss + '-arrow-inner"></div>' +
				'</div>' +
			'</div>'
		),
		view_box = $(
			'<div class="' + clss + '-viewbox">' +
				'<div class="' + clss + '-content">' +
					'<h2>Comment:</h2>' +
					'<textarea></textarea>' +
					'<ul class="' + clss + '-colors"></ul>' +
					'<button class="' + clss + '-submit">Submit</button>' +
					'<div class="' + clss + '-clear"></div>' +
				'</div>' +
				'<div class="' + clss + '-arrow">' +
					'<div class="' + clss + '-arrow-inner"></div>' +
				'</div>' +
			'</div>'
		),
		current_comment,
		comments_hash = {};
	
	//Aloha.Comments = Plugin.create('format', {
	return Plugin.create('format', {
		
		user	 : null,
		comments : {},
		colors	 : {
			'Golden Yellow' : '#fc0',
			'Blood Red'		: '#c33',
			'Sky Blue'		: '#9cf',
			'Grass Green'	: '#9c0'
		},
		isModalOpen	: false,
		isRevealing	: false,
		bar			: null,
		isBarOpen	: false,
		
		_constructor: function () {
			this._super('comments');
		},
		
		init: function () {
			var that = this,
				ul = add_box.find('.' + clss + '-colors');
			
			$('body').append(add_box)
				.mousedown(function () {
					that.bodyClicked.apply(that, arguments);
				})
				.mouseup(function () {
					//console.log(Aloha.Selection);
				});
			
			$.each(this.colors, function (k, v) {
				ul.append(
					$('<li title="' + k + '" style="background-color:' + v + '"></li>')
						.click(function () {that.setColor(k);})
				);
			});
			
			add_box.find('.' + clss + '-submit').click(function () {
				that.submit();
			});
			
			add_box.find('.' + clss + '-cancel').click(function () {
				that.cancelAdd();
			});
			
			this.preloadImages();
			this.initBtns();
			this.createBar();
		},
		
		initBtns: function () {
			var that = this,
				add_btn = new Aloha.ui.Button({
					iconClass: 'aloha-button aloha-comments-toolbar-btn aloha-comments-btn-add',
					onclick: function () {
						if (!that.isModalOpen) {
							that.addComment.apply(that, arguments);
						}
					},
					tooltip: 'Add comments to the selected range'
				}),
				reveal_btn = new Aloha.ui.Button({
					iconClass: 'aloha-button aloha-comments-toolbar-btn aloha-comments-btn-reveal',
					onclick: function () {
						if (!that.isModalOpen && !that.isBarOpen) {
							that.revealComments.apply(that, arguments);
						}
					},
					tooltip: 'Show all comments on document'
				});
			
			FloatingMenu.addButton(
				'Aloha.continuoustext',
				add_btn, 'Comments', 1
			);
			
			FloatingMenu.addButton(
				'Aloha.continuoustext',
				reveal_btn, 'Comments', 1
			);
		},
		
		cancelAdd: function () {
			//console.log(current_comment);
			this.closeModal();
			this.removeHighlight();
		},
		
		createBar: function () {
			var that = this,
				bar	 = this.bar = $(
					'<div class="' + clss + '-bar">'				+
						'<div class="' + clss + '-bar-shadow"></div>'		  +
						'<div class="' + clss + '-bar-toggle">'				  +
							'<div class="' + clss + '-bar-toggle-img"></div>' +
						'</div>'											  +
						'<div class="' + clss + '-bar-inner">'		+
							'<h2>'									+
								'Comments:'							+
							'</h2>'									+
							'<ul></ul>'								+
							'<div class="' + clss + '-bar-bottom">' +
							'</div>'								+
						'</div>'									+
					'</div>'
				).click(function () {
				 	that.barClicked.apply(that, arguments);
				 });
			
			$('body').append(bar);
			
			$(window).resize(function () {
				that.setBarScrolling();
			});
			
			this.bar.find('.' + clss + '-bar-toggle')
				.click(function () {
					if (that.isBarOpen) {
						$(this).removeClass(clss + '-bar-toggle-opened');
						that.closeBar();
					} else {
						$(this).addClass(clss + '-bar-toggle-opened');
						that.showBar();
					}
					
					
				});
			
			this.setBarScrolling();
		},
		
		barClicked: function (event) {
			var src = $(event.target),
				li = src;
			
			if (!src[0].tagName != 'LI') {
				li = li.parents('li');
			}
			
			if (li.length > 0) {
				this.insertReplyTools(li.first());
			}
		},
		
		getGravatar: function (email, size) {
			// MD5 (Message-Digest Algorithm) by WebToolkit
			// http://www.webtoolkit.info/javascript-md5.html
			var MD5 = function(s){function L(k,d){return(k<<d)|(k>>>(32-d))}function K(G,k){var I,d,F,H,x;F=(G&2147483648);H=(k&2147483648);I=(G&1073741824);d=(k&1073741824);x=(G&1073741823)+(k&1073741823);if(I&d){return(x^2147483648^F^H)}if(I|d){if(x&1073741824){return(x^3221225472^F^H)}else{return(x^1073741824^F^H)}}else{return(x^F^H)}}function r(d,F,k){return(d&F)|((~d)&k)}function q(d,F,k){return(d&k)|(F&(~k))}function p(d,F,k){return(d^F^k)}function n(d,F,k){return(F^(d|(~k)))}function u(G,F,aa,Z,k,H,I){G=K(G,K(K(r(F,aa,Z),k),I));return K(L(G,H),F)}function f(G,F,aa,Z,k,H,I){G=K(G,K(K(q(F,aa,Z),k),I));return K(L(G,H),F)}function D(G,F,aa,Z,k,H,I){G=K(G,K(K(p(F,aa,Z),k),I));return K(L(G,H),F)}function t(G,F,aa,Z,k,H,I){G=K(G,K(K(n(F,aa,Z),k),I));return K(L(G,H),F)}function e(G){var Z;var F=G.length;var x=F+8;var k=(x-(x%64))/64;var I=(k+1)*16;var aa=Array(I-1);var d=0;var H=0;while(H<F){Z=(H-(H%4))/4;d=(H%4)*8;aa[Z]=(aa[Z]|(G.charCodeAt(H)<<d));H++}Z=(H-(H%4))/4;d=(H%4)*8;aa[Z]=aa[Z]|(128<<d);aa[I-2]=F<<3;aa[I-1]=F>>>29;return aa}function B(x){var k="",F="",G,d;for(d=0;d<=3;d++){G=(x>>>(d*8))&255;F="0"+G.toString(16);k=k+F.substr(F.length-2,2)}return k}function J(k){k=k.replace(/\r\n/g,"\n");var d="";for(var F=0;F<k.length;F++){var x=k.charCodeAt(F);if(x<128){d+=String.fromCharCode(x)}else{if((x>127)&&(x<2048)){d+=String.fromCharCode((x>>6)|192);d+=String.fromCharCode((x&63)|128)}else{d+=String.fromCharCode((x>>12)|224);d+=String.fromCharCode(((x>>6)&63)|128);d+=String.fromCharCode((x&63)|128)}}}return d}var C=Array();var P,h,E,v,g,Y,X,W,V;var S=7,Q=12,N=17,M=22;var A=5,z=9,y=14,w=20;var o=4,m=11,l=16,j=23;var U=6,T=10,R=15,O=21;s=J(s);C=e(s);Y=1732584193;X=4023233417;W=2562383102;V=271733878;for(P=0;P<C.length;P+=16){h=Y;E=X;v=W;g=V;Y=u(Y,X,W,V,C[P+0],S,3614090360);V=u(V,Y,X,W,C[P+1],Q,3905402710);W=u(W,V,Y,X,C[P+2],N,606105819);X=u(X,W,V,Y,C[P+3],M,3250441966);Y=u(Y,X,W,V,C[P+4],S,4118548399);V=u(V,Y,X,W,C[P+5],Q,1200080426);W=u(W,V,Y,X,C[P+6],N,2821735955);X=u(X,W,V,Y,C[P+7],M,4249261313);Y=u(Y,X,W,V,C[P+8],S,1770035416);V=u(V,Y,X,W,C[P+9],Q,2336552879);W=u(W,V,Y,X,C[P+10],N,4294925233);X=u(X,W,V,Y,C[P+11],M,2304563134);Y=u(Y,X,W,V,C[P+12],S,1804603682);V=u(V,Y,X,W,C[P+13],Q,4254626195);W=u(W,V,Y,X,C[P+14],N,2792965006);X=u(X,W,V,Y,C[P+15],M,1236535329);Y=f(Y,X,W,V,C[P+1],A,4129170786);V=f(V,Y,X,W,C[P+6],z,3225465664);W=f(W,V,Y,X,C[P+11],y,643717713);X=f(X,W,V,Y,C[P+0],w,3921069994);Y=f(Y,X,W,V,C[P+5],A,3593408605);V=f(V,Y,X,W,C[P+10],z,38016083);W=f(W,V,Y,X,C[P+15],y,3634488961);X=f(X,W,V,Y,C[P+4],w,3889429448);Y=f(Y,X,W,V,C[P+9],A,568446438);V=f(V,Y,X,W,C[P+14],z,3275163606);W=f(W,V,Y,X,C[P+3],y,4107603335);X=f(X,W,V,Y,C[P+8],w,1163531501);Y=f(Y,X,W,V,C[P+13],A,2850285829);V=f(V,Y,X,W,C[P+2],z,4243563512);W=f(W,V,Y,X,C[P+7],y,1735328473);X=f(X,W,V,Y,C[P+12],w,2368359562);Y=D(Y,X,W,V,C[P+5],o,4294588738);V=D(V,Y,X,W,C[P+8],m,2272392833);W=D(W,V,Y,X,C[P+11],l,1839030562);X=D(X,W,V,Y,C[P+14],j,4259657740);Y=D(Y,X,W,V,C[P+1],o,2763975236);V=D(V,Y,X,W,C[P+4],m,1272893353);W=D(W,V,Y,X,C[P+7],l,4139469664);X=D(X,W,V,Y,C[P+10],j,3200236656);Y=D(Y,X,W,V,C[P+13],o,681279174);V=D(V,Y,X,W,C[P+0],m,3936430074);W=D(W,V,Y,X,C[P+3],l,3572445317);X=D(X,W,V,Y,C[P+6],j,76029189);Y=D(Y,X,W,V,C[P+9],o,3654602809);V=D(V,Y,X,W,C[P+12],m,3873151461);W=D(W,V,Y,X,C[P+15],l,530742520);X=D(X,W,V,Y,C[P+2],j,3299628645);Y=t(Y,X,W,V,C[P+0],U,4096336452);V=t(V,Y,X,W,C[P+7],T,1126891415);W=t(W,V,Y,X,C[P+14],R,2878612391);X=t(X,W,V,Y,C[P+5],O,4237533241);Y=t(Y,X,W,V,C[P+12],U,1700485571);V=t(V,Y,X,W,C[P+3],T,2399980690);W=t(W,V,Y,X,C[P+10],R,4293915773);X=t(X,W,V,Y,C[P+1],O,2240044497);Y=t(Y,X,W,V,C[P+8],U,1873313359);V=t(V,Y,X,W,C[P+15],T,4264355552);W=t(W,V,Y,X,C[P+6],R,2734768916);X=t(X,W,V,Y,C[P+13],O,1309151649);Y=t(Y,X,W,V,C[P+4],U,4149444226);V=t(V,Y,X,W,C[P+11],T,3174756917);W=t(W,V,Y,X,C[P+2],R,718787259);X=t(X,W,V,Y,C[P+9],O,3951481745);Y=K(Y,h);X=K(X,E);W=K(W,v);V=K(V,g)}var i=B(Y)+B(X)+B(W)+B(V);return i.toLowerCase()};
			var size = size || 80;
			return 'http://www.gravatar.com/avatar/' + MD5(email) + '.jpg?s=' + size;
		},
		
		addComment: function () {
			var that = this,
				range = Aloha.Selection.getRangeObject(),
				id = clss + '-' + (++uid),
				classes = [clss + '-wrapper', id],
				wrapper = $('<div class="' + classes.join(' ') + '">');
			
			dom_util.addMarkup(range, wrapper);
			
			// if the wrapper element does not exist, it means that there
			// was nothing in the selection to wrap around, indicating an
			// empty selection
			if ($('.' + id).length == 0) {
				// TODO: notify user
				return;
			}
			
			dom_util.doCleanup({'merge' : true, 'removeempty' : true}, range);
			
			var comment = current_comment = this.comments[id] = {
				id		  : id,
				timestamp : null,
				email	  : null,
				comment	  : null,
				mom		  : null,
				kids	  : [],
				color	  : this.colors['Golden Yellow'],
				elements  : $('.' + id),
				commonAncestor: $(range.getCommonAncestorContainer())
			};
			
			comments_hash[id] = this.comments[id];
			
			this.highlight(comment);
			this.openModal(comment);
			
			$('.aloha-floatingmenu').hide();
			
			comment.elements.click(function () {
				that.commentClicked(comment);
			}).hover(
				function () {that.hover(comment, true);},
				function () {that.hover(comment, false);}
			);
		},
		
		// Toogle marking of commented text on and off
		revealComments: function () {
			if (this.isRevealing) {
				$('.' + clss + '-active')
					.removeClass(clss + '-active')
					.css('background-color', '');
			} else {
				$.each(this.comments, function (id, comment) {
					comment.elements
						.addClass(clss + '-active')
						.css('background-color', comment.color);
				});
			}
			
			this.isRevealing = !this.isRevealing;
		},
		
		openModal: function (comment) {
			var that = this,
				el	 = comment.elements.first(),
				pos	 = el.offset();
			
			add_box
				.show()
				.css('height', 'auto')
				.find('input').val(this.user);
			
			var scroll_to,
				content	 = add_box.find('.' + clss + '-content'),
				input	 = add_box.find('input.' + clss + '-user').removeClass(clss + '-error'),
				textarea = add_box.find('textarea').removeClass(clss + '-error').val(''),
				h	= content.height(),
				ah	= 30,
				top = pos.top - (add_box.outerHeight(true) + ah);
			
			if (top <= 0) {
				scroll_to = pos.top - ah;
				el	= comment.elements.last();
				pos = el.last().offset();
				top = pos.top + el.height() + ah;
				add_box.addClass(clss + '-point-from-bottom');
			} else {
				add_box.removeClass(clss + '-point-from-bottom');
				scroll_to = top - ah;
			}
			
			add_box.css({
				left : pos.left + (el.width() / 2) - (add_box.outerWidth(true) / 2),
				top  : top,
				marginTop : h,
				opacity	  : 0
			}).animate({
				marginTop : 0,
				opacity	  : 1
			}, 800, 'easeOutElastic');
			
			$('body').animate({
				scrollTop: scroll_to
			}, 1000, 'easeOutExpo');
			
			if (this.user == '' || !this.user) {
				input.select();
			} else {
				input.val(this.user);
				textarea.focus();
			}
			
			content
				.css('height', 0)
				.animate({height: h}, 800, 'easeOutElastic');
			
			this.isModalOpen = true;
		},
		
		closeModal: function () {
			/*
			var content = add_box.find('.' + clss + '-content'),
				h = content.height();
			content.animate({height: 0}, 250, 'linear', function () {
				$(this).parent().hide();
			});
			
			add_box.animate({
				'margin-top': h
			}, 250, 'linear');
			 */
			
			$('.aloha-floatingmenu').show();
			add_box.fadeOut(250);
			this.isModalOpen = false;
		},
		
		highlight: function (comment) {
			comment.elements
				.css('background-color', comment.color)
				.addClass(clss + '-active')
				// traverse ancestors and mark them as such
				.parents().addClass(clss + '-ancestor')
				// find all siblings except floatingmenu -addbox -ancestor
				.siblings(':not(' +
					'.' + clss + '-addbox,'	  +
					'.' + clss + '-ancestor,' +
					'.' + clss + '-bar,'	  +
					'.aloha-floatingmenu'	  +
				')').addClass(clss + '-grayed');
			
			this.highlightElement(comment.commonAncestor);
			
			$('.' + clss + '-grayed').animate({opacity: 0.25}, 250);
			
			$('.' + clss + '-cleanme').each(function () {
				if (dom_util.isEmpty(this)) {
					$(this).remove();
				}
			});
		},
		
		highlightElement: function (element) {
			var that = this;
			
			element.contents().each(function () {
				var el = (this.nodeType == 3)
					? $(this).wrap('<span class="' + clss + '-cleanme">').parent()
					: $(this);
				
				if (el.hasClass(clss + '-ancestor')) {
					that.highlightElement(el);
				} else if (!el.hasClass(clss + '-active')) {
					el.addClass(clss + '-grayed');
				}
			});
			
			return element;
		},
		
		removeHighlight: function () {
			$('.' + clss + '-grayed')
				.removeClass(clss + '-grayed')
				.css('opacity', '');
			
			$('.' + clss + '-active')
				.removeClass(clss + '-active')
				.css('background-color', '');
			
			$('.' + clss + '-ancestor')
				.removeClass(clss + '-ancestor')
			
			if (typeof current_comment == 'object') {
				current_comment.elements.css('background-color', '');
				current_comment = undefined;
			}
		},
		
		hover: function (comment, onenter) {
			var el = comment.elements;
			if (!el.hasClass(clss + '-active')) {
				if (onenter) {
					el.addClass(clss + '-hover')
						.css('background-color', comment.color);
				} else {
					el.removeClass(clss + '-hover')
						.css('background-color', '');
				}
			}
		},
		
		commentClicked: function (comment) {
			this.showBar(comment);
		},
		
		showBar: function (comment) {
			var that = this,
				ul = this.bar.find('ul:first').html('');
			
			this.bar.animate({
				'width': 300
			}, 250, 'easeOutExpo');
			
			$('body').animate({
				marginLeft: 300
			}, 250, 'easeOutExpo');
			
			if (comment) {
				this.highlight(comment);
				this.printThread(ul, comment);
			} else {
				$.each(this.comments, function () {
					that.printThread(ul, this);
				});
			}
			
			this.isBarOpen = true;
			this.setBarScrolling();
		},
		
		setBarScrolling: function () {
			var bottom = this.bar.find('.' + clss + '-bar-bottom').position();
			
			this.bar
				.find('.' + clss + '-bar-inner')
				.css({
					height: $(window).height(),
					'overflow-y': (bottom.top > this.bar.height()) ? 'scroll' : 'auto'
				});
			
			this.bar
				.find('.' + clss + '-bar-shadow')
				.css('height', this.bar.height());
		},
		
		closeBar: function () {
			this.bar.animate({
				'width': 0
			}, 250, 'easeOutExpo');
			
			$('body').animate({
				marginLeft: 0
			}, 250, 'easeOutExpo');
			
			this.removeHighlight();
			this.isBarOpen = false;
		},
		
		printThread: function (el, comment) {
			var that = this,
				li = $(
					'<li data-aloha-comment="' + comment.id + '">' +
						'<div class="' + clss + '-bar-comment">' +
							'<img src="' + that.getGravatar(comment.email, 40) + '" alt="" />' +
							'<div style="float:left;">' +
								'<span>' + comment.email + ' says:</span>' +
								'<div>' + comment.comment + '</div>' +
							'</div>' +
							'<div class="' + clss + '-clear"></div>' +
						'</div>' +
					'</li>'
				);
			
			el.append(li);
			
			$.each(comment.kids, function () {
				var ul = $('<ul>');
				li.append(ul);
				that.printThread(ul, this);
			});
		},
		
		// Create reply textarea
		insertReplyTools: function (li) {
			var that = this,
				reply = li.addClass(clss + '-bar-comment-active')
						  .find('.aloha-comments-bar-comment>.' + clss + '-bar-reply');
			
			if (reply.length == 0) {
				reply = $(
					'<div class="' + clss + '-bar-reply">'	  +
						'<input value="' + this.user + '" />' +
						'<textarea>Replying...</textarea>'	  +
						'<button>Reply</button>'			  +
					'</div>'
				);
				li.find('>div').append(reply);
				li.find('button').click(function () {
					that.submitReply.call(that, reply);
				});
				
				var h = reply.css('height', 'auto').height();
				reply.css('height', 0)
					.animate({height: h}, 250, 'easeOutExpo');
				
				reply.find('input, textarea')
					.css('width', reply.width() - 12);
				
				reply.find('input').select();
				
				this.bar.scrollTop(reply.offset().top);
			}
		},
		
		submitReply: function (reply_tool) {
			var that = this,
				li	 = reply_tool.parents('li').first(),
				mom_id = li.attr('data-aloha-comment'),
				mom	 = comments_hash[mom_id];
			
			if (typeof mom == 'object') {
				var id	  = clss + '-' + (++uid),
					email = reply_tool.find('input').val().trim(),
					text  = reply_tool.find('textarea')
								.val().trim()
								.replace(/[\r\n]/g, '<br />'),
					index = mom.kids.push({
						id		  : id,
						timestamp : (new Date()).getTime(),
						email	  : email,
						comment	  : text,
						kids	  : [],
						mom		  : mom.id,
						color	  : mom.color,	  // inherit
						elements  : mom.elements, // inherit
						commonAncestor
								  : mom.elements  // inherit
					});
				
				comments_hash[id] = mom.kids[index - 1];
				
				reply_tool.animate(
					{height: 0}, 250, 'easeOutExpo',
					function () {
						$(this).remove();
						var ul = $('<ul>');
						li.append(ul);
						that.printThread(ul, comments_hash[id]);
					}
				);
				
				this.user = email;
			}
		},
		
		setColor: function (index) {
			current_comment.color = this.colors[index];
			current_comment.elements.css('background-color', current_comment.color);
			add_box.find('textarea').focus();
		},
		
		submit: function () {
			var textarea = add_box.find('textarea'),
				input	 = add_box.find('.' + clss + '-user'),
				email	 = input.val().trim(),
				comment	 = textarea.val().trim(),
				errors	 = false,
				err_clss = clss + '-error';
			
			if (email == '') {
				input.focus().addClass(err_clss);
				errors = true;
			} else {
				input.removeClass(err_clss);
			}
			
			if (comment == '') {
				textarea.focus().addClass(err_clss);
				errors = true;
			} else {
				textarea.removeClass(err_clss);
			}
			
			comment = comment.replace(/[\r\n]/g, '<br />');
			
			if (!errors) {
				$.extend(current_comment, {
					email	  : email,
					comment	  : comment,
					timestamp : (new Date()).getTime()
				});
				this.insertComment(current_comment);
				this.closeModal();
				this.showBar(current_comment);
				textarea.val('');
				input.val('');
			}
			
			this.user = email;
		},
		
		insertComment: function (comment) {
			comments_hash[comment.id] =
				this.comments[comment.id] = comment;
		},
		
		bodyClicked: function (event) {
			var el = $(event.target);
			
			if (this.isModalOpen && !el.hasClass(clss + '-addbox')) {
				if (el.parents('.' + clss + '-addbox').length == 0) {
					this.closeModal();
					this.removeHighlight();
				}
			}
			
			if (!this.isModalOpen) {
				if (!el.hasClass(clss + '-bar')) {
					if (el.parents('.' + clss + '-bar').length == 0) {
						this.removeHighlight();
					}
				}
			}
		},
		
		// What's the best way to determin the img path
		preloadImages: function () {
			$.each([
				'hr.png',
				'textbox.png'
			], function () {(new Image()).src = '../../plugin/comments/img/' + this;});
		}
		
	}); // Aloha.Comments
	
});