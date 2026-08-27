#!/usr/bin/env bash
set -euo pipefail
echo "── lint";      npm run lint
echo "── typecheck"; npm run typecheck
echo "── tests";     npm test -- --run
echo "── build";     npm run build
echo "── e2e";       npm run test:e2e
echo "✅ validate.sh en verde"