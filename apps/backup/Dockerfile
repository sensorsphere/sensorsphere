FROM golang:1.24-bookworm AS build

WORKDIR /src

COPY apps/backup/go.mod ./apps/backup/go.mod
COPY apps/backup/VERSION ./apps/backup/VERSION
COPY apps/backup/cmd ./apps/backup/cmd
COPY apps/backup/internal ./apps/backup/internal

WORKDIR /src/apps/backup

RUN go test ./...

ARG VCS_REF=unknown
RUN VERSION="$(tr -d '[:space:]' < VERSION)" && \
    CGO_ENABLED=0 GOOS=linux go build \
      -trimpath \
      -ldflags="-s -w -X main.version=$VERSION -X main.revision=$VCS_REF" \
      -o /out/sensorsphere-backup \
      ./cmd/sensorsphere-backup

FROM postgres:17-bookworm

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates zstd && \
    rm -rf /var/lib/apt/lists/*

COPY --from=build /out/sensorsphere-backup /usr/local/bin/sensorsphere-backup

ENTRYPOINT ["/usr/local/bin/sensorsphere-backup"]
