#!/usr/bin/env bash
#
# Cuts a release: bumps the version, writes the changelog entry, commits.
#
#   ./scripts/release.sh                  # patch: 1.5.14 -> 1.5.15
#   ./scripts/release.sh minor            # 1.5.14 -> 1.6.0
#   ./scripts/release.sh major            # 1.5.14 -> 2.0.0
#   ./scripts/release.sh patch "Square POS tiles"   # with a summary line
#
# The version lives in exactly two places — src/lib/version.ts (what the running
# app reports) and package.json (what tooling reads) — and this script is the
# only thing that writes either. Editing one by hand is how they drift, and a
# build that reports a version it is not is worse than a build with no version.
#
# Deliberately does NOT build or push. Releasing and deploying are different
# decisions: you may cut a version and ship it twice, or rebuild the same
# version after an infrastructure fix.

set -euo pipefail

cd "$(dirname "$0")/.."

BUMP="${1:-patch}"
SUMMARY="${2:-}"
VERSION_FILE="src/lib/version.ts"
LOG="VERSIONS.md"

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree is dirty. Commit your changes first — the release commit" >&2
  echo "should contain the version bump and nothing else." >&2
  git status --short >&2
  exit 1
fi

CURRENT=$(grep -oE 'APP_VERSION = "[0-9]+\.[0-9]+\.[0-9]+"' "$VERSION_FILE" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
if [ -z "$CURRENT" ]; then
  echo "Could not read APP_VERSION from $VERSION_FILE" >&2
  exit 1
fi

MAJOR=${CURRENT%%.*}
REST=${CURRENT#*.}
MINOR=${REST%%.*}
PATCH=${REST#*.}

case "$BUMP" in
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  patch) PATCH=$((PATCH + 1)) ;;
  *) echo "Usage: $0 [major|minor|patch] [summary]" >&2; exit 1 ;;
esac

NEXT="$MAJOR.$MINOR.$PATCH"
TODAY=$(date -u +%Y-%m-%d)

echo "$CURRENT -> $NEXT"

# Version constant.
sed -i.bak "s/APP_VERSION = \"$CURRENT\"/APP_VERSION = \"$NEXT\"/" "$VERSION_FILE"
rm -f "$VERSION_FILE.bak"

# package.json — matched on the top-level "version" key only, so a dependency
# that happens to carry the same number is never rewritten.
sed -i.bak "0,/\"version\": \"[0-9][^\"]*\"/s//\"version\": \"$NEXT\"/" package.json
rm -f package.json.bak

# Changelog entry, newest first, directly under the header.
if [ ! -f "$LOG" ]; then
  printf '# Version log\n\nEvery released build of Salon OS, newest first.\n\n' > "$LOG"
fi

if [ -z "$SUMMARY" ]; then
  # Fall back to the subject lines since the previous release, which is usually
  # what you would have typed anyway.
  LAST_TAG=$(git tag --list 'v*' --sort=-v:refname | head -1)
  if [ -n "$LAST_TAG" ]; then
    SUMMARY=$(git log --format='%s' "$LAST_TAG"..HEAD | sed 's/^/  - /')
  else
    SUMMARY=$(git log --format='%s' -3 | sed 's/^/  - /')
  fi
fi

TMP=$(mktemp)
{
  head -4 "$LOG"
  printf '## %s — %s\n\n%s\n\n' "$NEXT" "$TODAY" "$SUMMARY"
  tail -n +5 "$LOG"
} > "$TMP"
mv "$TMP" "$LOG"

git add "$VERSION_FILE" package.json "$LOG"
git commit -q -m "Release $NEXT"
git tag "v$NEXT"

cat <<EOF

Released $NEXT (tagged v$NEXT).

Still to do — releasing is not deploying:
  git push && git push --tags
  ./scripts/deploy.sh
EOF
