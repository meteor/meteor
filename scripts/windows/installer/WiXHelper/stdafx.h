// stdafx.h : include file for standard system include files,
// or project specific include files that are used frequently, but
// are changed infrequently
//

#pragma once

#include "targetver.h"

#define WIN32_LEAN_AND_MEAN             // Exclude rarely-used stuff from Windows headers
// Windows Header Files:
#include <windows.h>
#include <strsafe.h>
#include <msiquery.h>

// WiX Header Files:
#include <wcautil.h>


// TODO: reference additional headers your program requires here
typedef struct _BURN_DOWNLOAD_SOURCE
{
    LPWSTR sczUrl;
    LPWSTR sczUser;
    LPWSTR sczPassword;
} BURN_DOWNLOAD_SOURCE;
