#!/usr/bin/env bash
# Step 2: apply an import JSON to a family member (server must be running).
# Usage: scripts/apply-school-plan.sh week42-2026.json <memberId> [classId] [group]
# Leave out class/group to use the class/group saved in the member's profile (use 'none' for common info only). Re-running replaces (no duplicates).
set -euo pipefail
FILE="$1"; MEMBER="$2"; CLASS="${3:-}"; GROUP="${4:-}"
[ "$CLASS" = none ] && CLASS="" && NOCLASS=1
PORT="${PORT:-3000}"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
# local admin script: mint a short session cookie from config/auth.json (server is password-protected)
COOKIE=$(node -e 'const a=require(process.argv[1]),c=require("crypto");const v="v1."+(Date.now()+600000);console.log("fh_session="+v+"."+c.createHmac("sha256",a.sessionSecret).update(v).digest("base64url"))' "$DIR/config/auth.json")
curl -sf -b "$COOKIE" -X POST "http://localhost:$PORT/api/school-import/apply" -H 'Content-Type: application/json' \
  -d "{\"file\":\"$FILE\",\"memberId\":\"$MEMBER\"${CLASS:+,\"classId\":\"$CLASS\"}${GROUP:+,\"group\":\"$GROUP\"}}"
echo
