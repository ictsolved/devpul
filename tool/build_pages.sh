#!/bin/sh
# Builds the site the Pages workflow deploys into dist/: app and docs from the
# highest v* tag, the registry from this checkout, so a registry change or a
# plugin tag never ships an unreleased UI.
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)

tag=$(git -C "$root" -c versionsort.suffix=- tag --list 'v[0-9]*' --sort=-v:refname | head -n 1)
if [ -z "$tag" ]; then
  echo 'No v<version> tag' >&2
  exit 1
fi

work=$(mktemp -d)
trap 'git -C "$root" worktree remove --force "$work/site" 2>/dev/null; rm -rf "$work"' EXIT

(cd "$root" && dart run tool/build_registry.dart --skip-broken "$work/registry")
git -C "$root" worktree add --detach "$work/site" "$tag"
(cd "$work/site" && npm ci && DEVPUL_REGISTRY="$work/registry" npm run build:site)
rm -rf "$root/dist"
cp -R "$work/site/dist" "$root/dist"
echo "Built dist/ from $tag"
