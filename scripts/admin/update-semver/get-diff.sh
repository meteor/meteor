#!/usr/bin/env bash
cd ../../..

git diff devel --dirstat=files,0 -- ./packages/ | sed -E 's/^[ 0-9.]+% //g'
