# Latest Cardnews MySQL test deployment

This deployment is intentionally separate from the legacy root prototype and the existing PostgreSQL infrastructure.

## Server-only configuration

The deployment reads its runtime values from `/home/redcloud/services/pollinsight/infrastructure/.env`. The file stays on the Ubuntu server and must never be committed. It must define these names:

- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `MYSQL_ROOT_PASSWORD`
- `AUTH_SECRET`
- `GEMINI_API_KEY` when AI features are enabled

Do not place real values in this repository. Demo account seeding is disabled in the deployment.

## Isolation and rollback

- The latest test app listens on `127.0.0.1:3100` by default.
- A candidate image is checked on `127.0.0.1:3101` before promotion.
- The legacy application and PostgreSQL/Redis infrastructure are not stopped or replaced.
- If candidate validation fails, the running latest-test app remains unchanged.
- If promotion fails, the previous latest-test image is restored when available.
- MySQL and application data use named Docker volumes.

The Ubuntu scheduler should run `deploy/mysql/deploy-latest.sh` after the Windows upload window.
