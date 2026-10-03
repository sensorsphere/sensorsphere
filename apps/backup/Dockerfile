FROM --platform=$BUILDPLATFORM golang:1.24-bookworm AS build

RUN apt-get update && \
    apt-get install -y --no-install-recommends zstd && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /src

COPY apps/backup/go.mod ./apps/backup/go.mod
COPY apps/backup/VERSION ./apps/backup/VERSION
COPY apps/backup/cmd ./apps/backup/cmd
COPY apps/backup/internal ./apps/backup/internal

WORKDIR /src/apps/backup

RUN go test ./...

ARG TARGETOS
ARG TARGETARCH
ARG VCS_REF=unknown
RUN VERSION="$(tr -d '[:space:]' < VERSION)" && \
    CGO_ENABLED=0 GOOS="$TARGETOS" GOARCH="$TARGETARCH" go build \
      -trimpath \
      -ldflags="-s -w -X main.version=$VERSION -X main.revision=$VCS_REF" \
      -o /out/sensorsphere-backup \
      ./cmd/sensorsphere-backup

FROM debian:bookworm-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates wget && \
    wget -qO /usr/share/keyrings/postgresql.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc && \
    echo "deb [signed-by=/usr/share/keyrings/postgresql.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends postgresql-client-17 zstd tar && \
    apt-get purge -y --auto-remove wget && \
    rm -rf /var/lib/apt/lists/*

COPY --from=build /out/sensorsphere-backup /usr/local/bin/sensorsphere-backup

ENTRYPOINT ["/usr/local/bin/sensorsphere-backup"]
