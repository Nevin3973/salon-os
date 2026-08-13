#!/usr/bin/env bash
#
# Builds the image, stamps it with the commit it came from, and pushes it to
# DigitalOcean's registry. App Platform redeploys on registry push.
#
#   ./scripts/deploy.sh
#
# This exists because deploys no longer come from git. Pushing to GitHub does
# nothing until DigitalOcean's GitHub app is authorised on the account that owns
# the repository — so without a script the release procedure is a sequence
# somebody has to remember correctly at the wrong moment.
#
# Refuses to build from a dirty tree: an image stamped with a commit that does
# not match what went into it is worse than no stamp at all, because it looks
# authoritative.

set -euo pipefail

REGISTRY="registry.digitalocean.com/infynix-salonos"
IMAGE="salon-os"

if ! command -v doctl >/dev/null 2>&1; then
  echo "doctl not found. Install it and run: doctl auth init" >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree is dirty. Commit or stash first — the image is stamped" >&2
  echo "with HEAD, and a stamp that does not match the contents is misleading." >&2
  git status --short >&2
  exit 1
fi

SHA=$(git rev-parse --short HEAD)
FULL=$(git rev-parse HEAD)
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)

echo "Building $IMAGE from $SHA"
docker build \
  --build-arg "GIT_SHA=$SHA" \
  --build-arg "BUILT_AT=$NOW" \
  -t "$REGISTRY/$IMAGE:latest" \
  -t "$REGISTRY/$IMAGE:$SHA" \
  .

echo "Authenticating to the registry"
doctl registry login >/dev/null

# Both tags: `latest` is what the app spec tracks, and the sha tag makes a
# rollback possible without rebuilding — retagging an existing image is much
# faster than recreating one, and reproduces exactly what shipped.
echo "Pushing"
docker push "$REGISTRY/$IMAGE:latest"
docker push "$REGISTRY/$IMAGE:$SHA"

cat <<EOF

Pushed $SHA ($FULL)

App Platform redeploys automatically on registry push. Confirm with:

  curl -s https://sea-turtle-app-9qr3w.ondigitalocean.app/api/health

The 'version.commit' field in that response should read $SHA. If it still shows
the previous commit a few minutes from now, the deploy did not take — check the
Activity tab rather than assuming.
EOF
