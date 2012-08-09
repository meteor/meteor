<?php
/**
 * Gentics Aloha Editor AJAX Gateway
 * Copyright (c) 2010 Gentics Software GmbH
 * Licensed unter the terms of http://www.aloha-editor.com/license.html
 * aloha-sales@gentics.com
 * Author Haymo Meran h.meran@gentics.com
 * Author Johannes Schüth j.schuet@gentics.com
 * Author Tobias Steiner t.steiner@gentics.com
 * 
 * Testing from the command line:
 * function getallheaders(){return array('X-Gentics' => 'X');};
 * https url example: https://google.com/adsense
 * 
 */

// for debugging
//$_SERVER['SERVER_PROTOCOL'] = 'HTTP/1.0';
//$_SERVER['REQUEST_METHOD'] = 'HEAD';
//error_reporting(E_ALL);

$request = array(
    'method'   => $_SERVER['REQUEST_METHOD'],
    'protocol' => $_SERVER['SERVER_PROTOCOL'],
    'headers'  => getallheaders(),
    //TODO: multipart/form-data is not handled by php://input. there
    //doesn't seem to be a generic way to get at the raw post data for
    //that content-type.
    'payload'  => file_get_contents('php://input'),
);

// read url parameter
if (array_key_exists('url', $_GET)) {
	$request['url'] = urldecode($_GET['url']);
} else {
	header("HTTP/1.0 400 Bad Request");
	echo "Gentics AJAX Gateway failed because parameter url is missing.";
	exit();
}

// check if link exists
$response = http_request($request);

// Note HEAD does not always work even if specified...
// We use HEAD for Linkchecking so we do a 2nd request.
if (strtoupper($method) == 'HEAD' && (int)$response['status'] >= 400 ) {

	$request['method'] = 'GET';
	$response = http_request($request);

	//since we handle a HEAD, we don't need to proxy any contents
	fclose($response['socket']);
	$response['socket'] = null;
}

// forward each returned header...
foreach ($response['headers'] as $key => $value) {
	if (strtolower($key) == 'content-length') {
		//there is no need to specify a content length since we don't do keep
		//alive, and this can cause problems for integration (e.g. gzip output,
		//which would change the content length)
		//Note: overriding with header('Content-length:') will set
		//the content-length to zero for some reason
		continue;
	}
	header("$key: $value");
}

header('Connection: close');

// output the contents if any
if (null !== $response['socket']) {
	fpassthru($response['socket']);
	fclose($response['socket']);
}

exit;

/**
 * Query an HTTP(S) URL with the given request parameters and return the
 * response headers and status code. The socket is returned as well and
 * will point to the begining of the response payload (after all headers
 * have been read), and must be closed with fclose().
 * @param $url the request URL
 * @param $request the request method may optionally be overridden.
 * @param $timeout connection and read timeout in seconds
 */
function http_request($request, $timeout = 5) {

	$url = $request['url'];
	// Extract the hostname from url
	$parts = parse_url($url);
	if (array_key_exists('host', $parts)) {
		$remote = $parts['host'];
	} else {
		return myErrorHandler("url ($url) has no host. Is it relative?");
	}
	if (array_key_exists('port', $parts)) {
		$port = $parts['port'];
	} else {
		$port = 0;
	}

	// Beware that RFC2616 (HTTP/1.1) defines header fields as case-insensitive entities.
	$request_headers = "";
	foreach ($request['headers'] as $name => $value) {
		switch (strtolower($name)) {
		//omit some headers
		case "keep-alive":
		case "connection":
		case "cookie":
		//TODO: we don't handle any compression encodings. compression
		//can cause a problem if client communication is already being
		//compressed by the server/app that integrates this script
		//(which would double compress the content, once from the remote
		//server to us, and once from us to the client, but the client
		//would de-compress only once).
		case "accept-encoding":
			break;
		// correct the host parameter
		case "host":
			$host_info = $remote;
			if ($port) {
				$host_info .= ':' . $port;
			}
			$request_headers .= "$name: $host_info\r\n";
			break;
		// forward all other headers
		default:
			$request_headers .= "$name: $value\r\n";
			break;
		}
	}

	//set fsockopen transport scheme, and the default port
	switch (strtolower($parts['scheme'])) {
	case 'https':
		$scheme = 'ssl://';
		if ( ! $port ) $port = 443;
		break;
	case 'http':
		$scheme = '';
		if ( ! $port ) $port = 80;
		break;
	default:
		//some other transports are available but not really supported
		//by this script: http://php.net/manual/en/transports.inet.php
		$scheme = $parts['scheme'] . '://';
		if ( ! $port ) {
			return myErrorHandler("Unknown scheme ($scheme) and no port.");
		}
		break;
	}

	//we make the request with socket operations since we don't want to
	//depend on the curl extension, and the higher level wrappers don't
	//give us usable error information.
	$sock = @fsockopen("$scheme$remote", $port, $errno, $errstr, $timeout);
	if ( ! $sock ) {
		return myErrorHandler("Unable to open URL ($url): $errstr");
	}

	//the timeout in fsockopen is only for the connection, the following
	//is for reading the content
	stream_set_timeout($sock, $timeout);

	//an absolute url should only be specified for proxy requests
	if (array_key_exists('path', $parts)) {
		$path_info  = $parts['path'];
	} else {
		$path_info  = '/';
	}

	if (array_key_exists('query',    $parts)) $path_info .= '?' . $parts['query'];
	if (array_key_exists('fragment', $parts)) $path_info .= '#' . $parts['fragment'];

	$out = $request["method"]." ".$path_info." ".$request["protocol"]."\r\n"
		 . $request_headers
		 . "Connection: close\r\n\r\n";
	fwrite($sock, $out);
	fwrite($sock, $request['payload']);

	$header_str = stream_get_line($sock, 1024*16, "\r\n\r\n");
	$headers = http_parse_headers($header_str);
	$status_line = array_shift($headers);

	// get http status
	preg_match('|HTTP/\d+\.\d+\s+(\d+)\s+.*|i',$status_line,$match);
	$status = $match[1];

	return array('headers' => $headers, 'socket' => $sock, 'status' => $status);
}

/**
 * Parses a string containing multiple HTTP header lines into an array
 * of key => values.
 * Inspired by HTTP::Daemon (CPAN).
 */
function http_parse_headers($header_str) {
	$headers = array();

	//ignore leading blank lines
	$header_str = preg_replace("/^(?:\x0D?\x0A)+/", '', $header_str);

	while (preg_match("/^([^\x0A]*?)\x0D?(?:\x0A|\$)/", $header_str, $matches)) {
		$header_str = substr($header_str, strlen($matches[0]));
		$status_line = $matches[1];

		if (empty($headers)) {
			// the status line
			$headers[] = $status_line;
		}
		elseif (preg_match('/^([^:\s]+)\s*:\s*(.*)/', $status_line, $matches)) {
			if (isset($key)) {
				//previous header is finished (was potentially multi-line)
				$headers[$key] = $val;
			}
			list(,$key,$val) = $matches;
		}
		elseif (preg_match('/^\s+(.*)/', $status_line, $matches)) {
			//continue a multi-line header
			$val .= " ".$matches[1];
		}
		else {
			//empty (possibly malformed) header signals the end of all headers
			break;
		}
	}
	if (isset($key)) {
		$headers[$key] = $val;
	}
	return $headers;
}

function myErrorHandler($msg)
{
	// 500 could be misleading... 
	// Should we return a special Error when a proxy error occurs?
	header("HTTP/1.0 500 Internal Error");
	echo "Gentics Aloha Editor AJAX Gateway Error: $msg";
	exit();
}

//EOF
