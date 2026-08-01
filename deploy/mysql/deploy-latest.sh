#!/usr/bin/env bash
set -Eeuo pipefail

REPOSITORY_PATH="${REPOSITORY_PATH:-/home/redcloud/services/pollinsight/pollinsight-editor}"
WORKTREE_PATH="${WORKTREE_PATH:-/home/redcloud/services/pollinsight/pollinsight-latest-test}"
ENV_FILE="${POLLINSIGHT_ENV_FILE:-/home/redcloud/services/pollinsight/infrastructure/.env}"
TARGET_BRANCH="${TARGET_BRANCH:-agent/publish-latest-source}"
APP_PORT="${APP_PORT:-3100}"
CANDIDATE_PORT="${CANDIDATE_PORT:-3101}"
LOG_DIRECTORY="${LOG_DIRECTORY:-/home/redcloud/services/pollinsight/logs}"
LOCK_FILE="${LOCK_FILE:-/tmp/pollinsight-latest-deploy.lock}"

mkdir -p "$LOG_DIRECTORY"
exec >>"$LOG_DIRECTORY/latest-deploy.log" 2>&1
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  printf '[%s] Another deployment is already running.\n' "$(date --iso-8601=seconds)"
  exit 0
fi

log() {
  printf '[%s] %s\n' "$(date --iso-8601=seconds)" "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

wait_for_healthy() {
  local container_name="$1"
  local attempts="${2:-24}"
  local status
  for ((attempt = 1; attempt <= attempts; attempt++)); do
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_name" 2>/dev/null || true)"
    if [[ "$status" == "healthy" ]]; then
      return 0
    fi
    if [[ "$status" == "unhealthy" || "$status" == "exited" || "$status" == "dead" ]]; then
      return 1
    fi
    sleep 5
  done
  return 1
}

[[ -d "$REPOSITORY_PATH/.git" ]] || fail "Repository not found at $REPOSITORY_PATH"
[[ -f "$ENV_FILE" ]] || fail "Server environment file not found at the configured path"

log "Fetching $TARGET_BRANCH without modifying the existing Ubuntu working tree."
git -C "$REPOSITORY_PATH" fetch origin "$TARGET_BRANCH" --quiet
target_commit="$(git -C "$REPOSITORY_PATH" rev-parse "origin/$TARGET_BRANCH")"
short_commit="${target_commit:0:12}"

if [[ ! -e "$WORKTREE_PATH/.git" ]]; then
  if [[ -e "$WORKTREE_PATH" && -n "$(find "$WORKTREE_PATH" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]]; then
    fail "Worktree path exists and is not empty: $WORKTREE_PATH"
  fi
  git -C "$REPOSITORY_PATH" worktree add --detach "$WORKTREE_PATH" "origin/$TARGET_BRANCH" --quiet
else
  if [[ -n "$(git -C "$WORKTREE_PATH" status --porcelain)" ]]; then
    fail "Deployment worktree contains local changes and was left untouched: $WORKTREE_PATH"
  fi
  git -C "$WORKTREE_PATH" checkout --detach "origin/$TARGET_BRANCH" --quiet
fi

compose_file="$WORKTREE_PATH/deploy/mysql/compose.yaml"
app_context="$WORKTREE_PATH/Cardnews product"
[[ -f "$compose_file" ]] || fail "MySQL Compose file is missing from commit $short_commit"
[[ -f "$app_context/Dockerfile" ]] || fail "Application Dockerfile is missing from commit $short_commit"

export POLLINSIGHT_ENV_FILE="$ENV_FILE"
export APP_PORT
new_image="pollinsight-cardnews:$short_commit"

log "Building candidate image $new_image."
docker build --pull --tag "$new_image" "$app_context"

export APP_IMAGE="$new_image"
docker compose --env-file "$ENV_FILE" -f "$compose_file" up -d mysql
wait_for_healthy pollinsight-latest-mysql 36 || fail 'MySQL did not become healthy; existing application containers were not changed.'

candidate_name="pollinsight-candidate-$short_commit"
docker rm -f "$candidate_name" >/dev/null 2>&1 || true
cleanup_candidate() {
  docker rm -f "$candidate_name" >/dev/null 2>&1 || true
}
trap cleanup_candidate EXIT

log "Starting isolated candidate container on port $CANDIDATE_PORT."
docker run -d --rm \
  --name "$candidate_name" \
  --network pollinsight-latest-network \
  --env-file "$ENV_FILE" \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e DB_HOST=pollinsight-latest-mysql \
  -e SEED_DEMO_ACCOUNT=false \
  -p "127.0.0.1:$CANDIDATE_PORT:3000" \
  "$new_image" >/dev/null

wait_for_healthy "$candidate_name" 24 || fail 'Candidate health check failed; the existing application container was preserved.'
log 'Candidate health check passed.'

previous_image="$(docker inspect --format '{{.Config.Image}}' pollinsight-latest-app 2>/dev/null || true)"
cleanup_candidate
trap - EXIT

log "Promoting validated image to the latest test service on port $APP_PORT."
if ! docker compose --env-file "$ENV_FILE" -f "$compose_file" up -d --no-build app; then
  if [[ -n "$previous_image" ]]; then
    log "Promotion command failed; restoring previous image $previous_image."
    APP_IMAGE="$previous_image" docker compose --env-file "$ENV_FILE" -f "$compose_file" up -d --no-build app || true
  fi
  fail 'Promotion failed.'
fi

if ! wait_for_healthy pollinsight-latest-app 24; then
  if [[ -n "$previous_image" ]]; then
    log "Promoted container failed health checks; restoring previous image $previous_image."
    APP_IMAGE="$previous_image" docker compose --env-file "$ENV_FILE" -f "$compose_file" up -d --no-build app
    wait_for_healthy pollinsight-latest-app 24 || fail 'Rollback was attempted but the previous image did not become healthy.'
  else
    docker compose --env-file "$ENV_FILE" -f "$compose_file" stop app || true
  fi
  fail 'Promoted container failed health checks; rollback completed when a previous image was available.'
fi

log "Deployment and health verification completed for commit $target_commit."
