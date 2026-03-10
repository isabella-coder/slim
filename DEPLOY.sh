#!/usr/bin/env bash

set -euo pipefail

cat <<'MSG'
[BLOCKED] DEPLOY.sh is a legacy compatibility entry and is disabled by default.

Use unified deployment instead:
  bash DEPLOY_PRODUCTION.sh

References:
  - docs/统一发布流程.md
  - DEPLOY_LEGACY.md (historical legacy chain notes)

If you intentionally need the old 8080/admin-console chain, read DEPLOY_LEGACY.md
and run the legacy steps manually in a controlled environment.
MSG

exit 1
