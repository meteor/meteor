

RExpr.compile = function (strOrParse) {
  if (typeof strOrParse === 'string')
    return RExpr.compile(RExpr.parse(strOrParse));

  var tree = strOrParse;

  var refs = [];
  getRefs(tree, refs);

  return { refs: refs,
           str: stringify(tree, refs) };
};

var toString = Object.prototype.toString;
var isObject = function ( obj ) {
  return ( typeof obj === 'object' && toString.call( obj ) === '[object Object]' );
};

var getRefs = function ( token, refs ) {
  var i, list;

  if ( token.t === RExpr.REFERENCE ) {
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


var stringify = function ( token, refs ) {
  var map = function ( item ) {
    return stringify( item, refs );
  };

  switch ( token.t ) {
  case RExpr.BOOLEAN_LITERAL:
  case RExpr.GLOBAL:
  case RExpr.NUMBER_LITERAL:
    return token.v;

  case RExpr.STRING_LITERAL:
    return "'" + token.v.replace( /'/g, "\\'" ) + "'";

  case RExpr.ARRAY_LITERAL:
    return '[' + ( token.m ? token.m.map( map ).join( ',' ) : '' ) + ']';

  case RExpr.OBJECT_LITERAL:
    return '{' + ( token.m ? token.m.map( map ).join( ',' ) : '' ) + '}';

  case RExpr.KEY_VALUE_PAIR:
    return stringifyKey( token.k ) + ':' + stringify( token.v, refs );

  case RExpr.PREFIX_OPERATOR:
    return ( token.s === 'typeof' ? 'typeof ' : token.s ) + stringify( token.o, refs );

  case RExpr.INFIX_OPERATOR:
    return stringify( token.o[0], refs ) + ( token.s.substr( 0, 2 ) === 'in' ? ' ' + token.s + ' ' : token.s ) + stringify( token.o[1], refs );

  case RExpr.INVOCATION:
    return stringify( token.x, refs ) + '(' + ( token.o ? token.o.map( map ).join( ',' ) : '' ) + ')';

  case RExpr.BRACKETED:
    return '(' + stringify( token.x, refs ) + ')';

  case RExpr.MEMBER:
    return stringify( token.x, refs ) + stringify( token.r, refs );

  case RExpr.REFINEMENT:
    return ( token.n ? '.' + token.n : '[' + stringify( token.x, refs ) + ']' );

  case RExpr.CONDITIONAL:
    return stringify( token.o[0], refs ) + '?' + stringify( token.o[1], refs ) + ':' + stringify( token.o[2], refs );

  case RExpr.REFERENCE:
    return '${' + refs.indexOf( token.n ) + '}';

  default:
    throw new Error( 'Could not stringify expression token. This error is unexpected (token.t: ' + token.t + ')' );
  }
};

var stringifyKey = function ( key ) {
  if ( key.t === RExpr.STRING_LITERAL ) {
    return identifier.test( key.v ) ? key.v : '"' + key.v.replace( /"/g, '\\"' ) + '"';
  }

  if ( key.t === RExpr.NUMBER_LITERAL ) {
    return key.v;
  }

  return key;
};

var identifier = /^[a-zA-Z_$][a-zA-Z_$0-9]*$/;
