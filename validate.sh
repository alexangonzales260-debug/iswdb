#!/usr/bin/env bash
set -euo pipefail
echo "── lint";      npm run lint
echo "── typecheck"; npm run typecheck
echo "── tests";     npm test -- --run
echo "── build";     npm run build
echo "✅ validate.sh en verde"