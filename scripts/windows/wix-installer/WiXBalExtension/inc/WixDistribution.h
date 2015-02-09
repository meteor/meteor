/* **************************************************************************
 * WixDistribution.h file contains disribution specific items, such as
 * Product Name.
 * 
 * **************************************************************************/

#pragma once

#ifndef __WIXDISTRIBUTION_FILE_H_
#define __WIXDISTRIBUTION_FILE_H_

#ifdef VER_PRODUCT_NAME
    #undef VER_PRODUCT_NAME
#endif
#define VER_PRODUCT_NAME "Windows Installer XML"

#endif // __WIXDISTRIBUTION_FILE_H_
