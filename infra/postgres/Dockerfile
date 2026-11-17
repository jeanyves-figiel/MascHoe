# Postgres 16 + h3-pg (ADR-0001). Used by DEV compose, CI and the Fly DB machine.
FROM postgres:16-bookworm
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-16-h3 \
 && rm -rf /var/lib/apt/lists/*
