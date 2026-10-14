#!/usr/bin/env bash
set -euo pipefail
echo "── lint";      npm run lint
echo "── typecheck"; npm run typecheck
echo "── tests";     NODE_OPTIONS='--experimental-websocket' npm test -- --run
echo "── build";     npm run build
echo "── e2e";       NODE_OPTIONS='--experimental-websocket' npm run test:e2e
echo "✅ validate.sh en verde"