FROM docker:27-cli AS dockercli

FROM node:22-bookworm-slim

ARG UID
ENV UID=${UID:-1001}
ARG GID
ENV GID=${GID:-1001}

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       git \
       gh \
       curl \
       jq \
       ca-certificates \
       bash \
       openssh-client \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -g "${GID}" ubuntu \
    && useradd \
       -m \
       -u "${UID}" \
       -g "${GID}" \
       -s /bin/bash \
       ubuntu

COPY --from=dockercli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=dockercli /usr/local/libexec/docker/cli-plugins/docker-compose \
    /usr/local/libexec/docker/cli-plugins/docker-compose
COPY --from=dockercli /usr/local/libexec/docker/cli-plugins/docker-buildx \
    /usr/local/libexec/docker/cli-plugins/docker-buildx

USER ubuntu
WORKDIR /home/ubuntu

CMD ["npx", "-y", "@wonderwhy-er/desktop-commander@latest", "remote"]
