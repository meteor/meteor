#!/bin/sh -ex

# brew install clang-format

CLANG_FORMAT_VERSION=`clang-format -version | awk '{ print $3 }'`
if [[ "$CLANG_FORMAT_VERSION" != "5.0.0" ]]; then
  echo "Unsupported clang-format version"
  exit 1
fi

pushd "GCDWebServer/Core"
clang-format -style=file -i *.h *.m
popd
pushd "GCDWebServer/Requests"
clang-format -style=file -i *.h *.m
popd
pushd "GCDWebServer/Responses"
clang-format -style=file -i *.h *.m
popd
pushd "GCDWebUploader"
clang-format -style=file -i *.h *.m
popd
pushd "GCDWebDAVServer"
clang-format -style=file -i *.h *.m
popd

pushd "Frameworks"
clang-format -style=file -i *.h *.m
popd
pushd "Mac"
clang-format -style=file -i *.m
popd
pushd "iOS"
clang-format -style=file -i *.h *.m
popd
pushd "tvOS"
clang-format -style=file -i *.h *.m
popd

echo "OK"
