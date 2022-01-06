package com.meteor.webapp;

import android.net.Uri;

interface WebResourceHandler {
    Uri remapUri(Uri uri);
}
