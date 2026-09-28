FROM caddy:2.11.4-builder-alpine AS builder

# caddy-dns/cloudflare v0.2.4 still limits API tokens to 50 characters.
# Cloudflare can now issue cfut_-prefixed tokens longer than that. Build from
# the official tagged source and widen only that local sanity-check regex.
RUN apk add --no-cache git \
    && git clone --depth 1 --branch v0.2.4 \
       https://github.com/caddy-dns/cloudflare.git /src/cloudflare \
    && sed -i 's/{35,50}/{35,70}/' /src/cloudflare/cloudflare.go \
    && grep -q '{35,70}' /src/cloudflare/cloudflare.go \
    && xcaddy build \
       --with github.com/caddy-dns/cloudflare=/src/cloudflare

FROM caddy:2.11.4-alpine

COPY --from=builder /usr/bin/caddy /usr/bin/caddy
