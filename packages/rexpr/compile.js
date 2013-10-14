
RExpr.compile = function (strOrParse) {
  if (typeof strOrParse === 'string')
    return RExpr.compile(RExpr.parse(strOrParse));

  var tree = strOrParse;

  var stub = new ExpressionStub(tree);
  return { refs: stub.refs,
           str: stub.str };
};

var isObject = function (x) {
  return (typeof x.length) !== 'number'; // not an array
};

var doMap = function (func, list) {
  var out = new Array(list.length);
  for (var i = 0; i < list.length; i++)
    out[i] = func(list[i]);
  return out;
};

////////////////////
// from: Ractive/src/parser/getStub/ExpressionStub.js
//
// - Replace: "token.m.map( map )" -> "doMap(map, token.m)" (2 occurrences)
// - Replace: "token.o.map( map )" -> "doMap(map, token.o)" (1 occurrence)

var ExpressionStub;

(function () {

  var getRefs, quoteStringLiteral, stringify, stringifyKey, identifier;

  ExpressionStub = function ( token ) {
    this.refs = [];

    getRefs( token, this.refs );
    try {
      var _map = Array.prototype.map;
      Array.prototype.map = null;
    this.str = stringify( token, this.refs );
    } finally {
      Array.prototype.map = _map;
    }
  };

  ExpressionStub.prototype = {
    toJSON: function () {
      if ( this.json ) {
	return this.json;
      }

      this.json = {
	r: this.refs,
	s: this.str
      };

      return this.json;
    }
  };


  // TODO maybe refactor this?
  getRefs = function ( token, refs ) {
    var i, list;

    if ( token.t === REFERENCE ) {
      if ( refs.indexOf( token.n ) === -1 ) {
	refs.unshift( token.n );
      }
    }

    list = token.o || token.m;
    if ( list ) {
      if ( isObject( list ) ) {
	getRefs( list, refs );
      } else {
	i = list.length;
	while ( i-- ) {
	  getRefs( list[i], refs );
	}
      }
    }

    if ( token.x ) {
      getRefs( token.x, refs );
    }

    if ( token.r ) {
      getRefs( token.r, refs );
    }

    if ( token.v ) {
      getRefs( token.v, refs );
    }
  };


  quoteStringLiteral = function ( str ) {
    return JSON.stringify(String(str));
  };


  stringify = function ( token, refs ) {
    var map = function ( item ) {
      return stringify( item, refs );
    };

    switch ( token.t ) {
    case BOOLEAN_LITERAL:
    case GLOBAL:
    case NUMBER_LITERAL:
      return token.v;

    case STRING_LITERAL:
      return quoteStringLiteral(token.v);

    case ARRAY_LITERAL:
      return '[' + ( token.m ? doMap(map, token.m).join( ',' ) : '' ) + ']';

    case OBJECT_LITERAL:
      return '{' + ( token.m ? doMap(map, token.m).join( ',' ) : '' ) + '}';

    case KEY_VALUE_PAIR:
      return stringifyKey( token.k ) + ':' + stringify( token.v, refs );

    case PREFIX_OPERATOR:
      return ( token.s === 'typeof' ? 'typeof ' : token.s ) + stringify( token.o, refs );

    case INFIX_OPERATOR:
      return stringify( token.o[0], refs ) + ( token.s.substr( 0, 2 ) === 'in' ? ' ' + token.s + ' ' : token.s ) + stringify( token.o[1], refs );

    case INVOCATION:
      return stringify( token.x, refs ) + '(' + ( token.o ? doMap(map, token.o).join( ',' ) : '' ) + ')';

    case BRACKETED:
      return '(' + stringify( token.x, refs ) + ')';

    case MEMBER:
      return stringify( token.x, refs ) + stringify( token.r, refs );

    case REFINEMENT:
      return ( token.n ? '.' + token.n : '[' + stringify( token.x, refs ) + ']' );

    case CONDITIONAL:
      return stringify( token.o[0], refs ) + '?' + stringify( token.o[1], refs ) + ':' + stringify( token.o[2], refs );

    case REFERENCE:
      return '${' + refs.indexOf( token.n ) + '}';

    default:
      console.log( token );
      throw new Error( 'Could not stringify expression token. This error is unexpected' );
    }
  };

  stringifyKey = function ( key ) {
    if ( key.t === STRING_LITERAL ) {
      return identifier.test( key.v ) ? key.v : quoteStringLiteral( key.v );
    }

    if ( key.t === NUMBER_LITERAL ) {
      return key.v;
    }

    return key;
  };

  identifier = /^[a-zA-Z_$][a-zA-Z_$0-9]*$/;

}());
////////////////////
