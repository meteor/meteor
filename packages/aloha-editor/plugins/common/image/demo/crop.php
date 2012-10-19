<?php
/**
 * Simple, very basic image cropper for CropNResize plugin demonstration
 * @author Clemens Prerovsky
 */
header('Content-type: image/jpeg');

// load parameters from url
$src = $_GET["src"];
$x = intval($_GET["x"]);
$y = intval($_GET["y"]);
$w = intval($_GET["w"]);
$h = intval($_GET["h"]);

// resize image
$img = imagecreatefromjpeg($src) or die("Error: unknown src");
$cropped = imagecreatetruecolor($w, $h);
imagecopyresampled($cropped, $img, 0, 0, $x, $y, $w, $h, $w, $h);
imagejpeg($cropped);
imagedestroy($cropped);
?>
