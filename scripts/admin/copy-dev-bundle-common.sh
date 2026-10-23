#!/usr/bin/env bash

# Shared by the regular and Apple Silicon publication entry points.
copy_dev_bundle() {
    local suffix=$1
    shift

    local target="s3://com.meteor.static/test/"
    if [ "${1:-}" = "--prod" ]; then
        target="s3://com.meteor.static/"
        shift
    fi
    if [ $# -ne 1 ] || [ -z "${1:-}" ]; then
        echo "usage: $0 [--prod] build-number-or-run-number--commit" >&2
        return 1
    fi

    local build_id=$1
    local bundle_version
    bundle_version=$(sed -n 's/^BUNDLE_VERSION=//p' ../../meteor)
    if [ -z "$bundle_version" ]; then
        echo "BUNDLE_VERSION not found in meteor" >&2
        return 1
    fi

    # Actions run numbers are scoped to a workflow. Different workflows can
    # have the same run number and release-bot commit on different dates.
    # Identify the uploaded bundle by this checkout's version, never by date
    # ordering, and fail if that still leaves more than one candidate.
    local builds kind directory listing artifacts artifact
    local selected_directory="" selected_artifacts="" has_version
    builds=$(aws s3 ls "s3://com.meteor.jenkins/")
    while read -r kind directory; do
        [ "$kind" = "PRE" ] || continue
        directory=${directory%/}
        case "$directory" in
            dev-bundle-*--"$build_id""$suffix") ;;
            *) continue ;;
        esac

        listing=$(aws s3 ls "s3://com.meteor.jenkins/$directory/")
        artifacts=$(printf '%s\n' "$listing" | awk 'NF { print $NF }' | LC_ALL=C sort)
        has_version=no
        while IFS= read -r artifact; do
            case "$artifact" in
                dev_bundle_*_"$bundle_version".tar.gz) has_version=yes ;;
            esac
        done <<< "$artifacts"
        [ "$has_version" = "yes" ] || continue

        if [ -n "$selected_directory" ]; then
            echo "Multiple builds contain bundle $bundle_version: $selected_directory and $directory" >&2
            return 1
        fi
        selected_directory=$directory
        selected_artifacts=$artifacts
    done <<< "$builds"

    if [ -z "$selected_directory" ]; then
        echo "Build $build_id containing bundle $bundle_version not found" >&2
        return 1
    fi
    echo "Found build $selected_directory for bundle $bundle_version"

    local expected platform
    if [ "$suffix" = "-mac-m1" ]; then
        expected="dev_bundle_Darwin_arm64_${bundle_version}.tar.gz"
    else
        expected=$(
            for platform in Darwin_x86_64 Linux_aarch64 Linux_x86_64 windows_x64; do
                printf 'dev_bundle_%s_%s.tar.gz\n' "$platform" "$bundle_version"
            done | LC_ALL=C sort
        )
    fi
    if [ "$selected_artifacts" != "$expected" ]; then
        echo "Missing or unexpected tarballs in $selected_directory; expected:" >&2
        printf '%s\n' "$expected" >&2
        return 1
    fi

    while IFS= read -r artifact; do
        if aws s3 ls "$target$artifact" >/dev/null; then
            echo "$target$artifact already exists (maybe from another branch?)" >&2
            return 1
        fi
    done <<< "$selected_artifacts"

    echo "Copying to $target"
    aws s3 cp --acl public-read --recursive \
        "s3://com.meteor.jenkins/$selected_directory/" "$target"
}
