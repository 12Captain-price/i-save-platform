#!/bin/sh
set -eu
# Never enable shell tracing or print the generated nginx configuration.
export GATEWAY_TOKEN="$(cat /run/secrets/gateway_token)"
printf '%s' "$GATEWAY_TOKEN" | grep -Eq '^[A-Za-z0-9_-]{32,128}$' || exit 1
printf '%s' "$PUBLIC_ORIGIN" | grep -Eq '^https://[A-Za-z0-9.-]+(:[0-9]+)?$' || exit 1
export PUBLIC_HOST="${PUBLIC_ORIGIN#https://}"
export NGINX_ENVSUBST_FILTER='^(PUBLIC_ORIGIN|PUBLIC_HOST|GATEWAY_TOKEN)$'
exec /docker-entrypoint.sh nginx -g 'daemon off;'
