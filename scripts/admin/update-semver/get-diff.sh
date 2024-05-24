#!/usr/bin/env bash
cd ../../..

git diff devel --dirstat=files -- ./packages/ | sed -E 's/^[ 0-9.]+% //g'
