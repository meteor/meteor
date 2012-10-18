(function(window, undefined) {
	var jQuery = window.jQuery
	if (window.Aloha === undefined || window.Aloha === null) {
		window.Aloha = {};		
	}
	window.Aloha.settings = {
				logLevels: {'error': true, 'warn': true, 'info': true, 'debug': false},
				errorhandling : false,
				ribbon: false,

				"placeholder": {
					'*': '<img src="http://aloha-editor.org/logo/Aloha%20Editor%20HTML5%20technology%20class%2016.png" alt="logo"/>&nbsp;Placeholder All',
					'#typo3span': 'Placeholder for span'
				},
				"i18n": {
					// you can either let the system detect the users language (set acceptLanguage on server)
					// In PHP this would would be '<?=$_SERVER['HTTP_ACCEPT_LANGUAGE']?>' resulting in
					// "acceptLanguage": 'de-de,de;q=0.8,it;q=0.6,en-us;q=0.7,en;q=0.2'
					// or set current on server side to be in sync with your backend system
					"current": "en"
				},
				repositories: {
					linklist: {
						data: [
									{ name: 'Aloha Developers Wiki', url:'http://www.aloha-editor.com/wiki', type:'website', weight: 0.50 },
									{ name: 'Aloha Editor - The HTML5 Editor', url:'http://aloha-editor.com', type:'website', weight: 0.90  },
									{ name: 'Aloha Demo', url:'http://www.aloha-editor.com/demos.html', type:'website', weight: 0.75  },
									{ name: 'Aloha Wordpress Demo', url:'http://www.aloha-editor.com/demos/wordpress-demo/index.html', type:'website', weight: 0.75  },
									{ name: 'Aloha Logo', url:'http://www.aloha-editor.com/images/aloha-editor-logo.png', type:'image', weight: 0.10  }
						]
					}
				},
				"plugins": {
					"format": {
						// all elements with no specific configuration get this configuration
						config : [ 'b', 'i','sub','sup'],
							editables : {
							// no formatting allowed for title
							'#title'	: [ ],
							// formatting for all editable DIVs
							'div'		: [ 'b', 'i', 'del', 'sub', 'sup'  ],
							// content is a DIV and has class .article so it gets both buttons
							'.article'	: [ 'b', 'i', 'p', 'title', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'removeFormat']
							}
					},
					"list": {
						// all elements with no specific configuration get an UL, just for fun :)
						config : [ 'ul' ],
							editables : {
							// Even if this is configured it is not set because OL and UL are not allowed in H1.
							'#title'	: [ 'ol' ],
							// all divs get OL
							'div'		: [ 'ol' ],
							// content is a DIV. It would get only OL but with class .article it also gets UL.
							'.article'	: [ 'ul' ]
							}
					},
					"link": {
						// all elements with no specific configuration may insert links
						config : [ 'a' ],
							editables : {
							// No links in the title.
							'#title'	: [  ]
							},
							// all links that match the targetregex will get set the target
						// e.g. ^(?!.*aloha-editor.com).* matches all href except aloha-editor.com
							targetregex : '^(?!.*aloha-editor.com).*',
							// this target is set when either targetregex matches or not set
							// e.g. _blank opens all links in new window
							target : '_blank',
							// the same for css class as for target
							cssclassregex : '^(?!.*aloha-editor.com).*',
							cssclass : 'aloha',
							// use all resources of type website for autosuggest
							objectTypeFilter: ['website'],
							// handle change of href
							onHrefChange: function( obj, href, item ) {
								if ( item ) {
									jQuery(obj).attr('data-name', item.name);
								}
							}
					},
					"table": {
						// all elements with no specific configuration are not allowed to insert tables
						config : [ ],
							editables : {
							// Allow insert tables only into .article
							'.article'	: [ 'table' ]
							},
							// [{name:'green', text:'Green', tooltip:'Green is cool', iconClass:'GENTICS_table GENTICS_button_green', cssClass:'green'}]
						tableConfig : [
											{name:'hor-minimalist-a'},
											{name:'box-table-a'},
											{name:'hor-zebra'},
							],
							columnConfig : [
											{name:'bigbold', iconClass:'GENTICS_button_col_bigbold'},
											{name:'redwhite', iconClass:'GENTICS_button_col_redwhite'}
							],
						rowConfig : [
										{name:'bigbold', iconClass:'GENTICS_button_row_bigbold'},
										{name:'redwhite', iconClass:'GENTICS_button_row_redwhite'}
							]

					},
					"image": {
	   					config : { 'img': { 'max_width': '50px',
								'max_height': '50px' }},
					  	editables : {
							'#title'	: {}
					  	}
					}
					}
			};
})(window);