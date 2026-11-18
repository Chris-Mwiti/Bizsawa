# ✅ Phase 1: Self-hosted PowerSync service

The repository starts with the WatermelonDB engine and the custom `/api/v1/sync` endpoints. This phase adds a PowerSync service beside them and leaves the old path in place.

**Today**

The repository has no PowerSync service. Mobile syncs through WatermelonDB and the custom `/api/v1/sync` pull/push endpoints.

**Proposed**

Docker Compose runs `journeyapps/powersync-service` beside Postgres and Redis. An init script creates the `powersync_role`, the `powersync` publication, and the `powersync_storage` database. Development and production configs point at the compose Postgres by default, with environment overrides for an external database such as Supabase. Make targets start, stop, and inspect the service.

The service keeps its own bucket state in `powersync_storage`; the source database stays authoritative. The publication and slot stream changes from the source, and the storage database records checkpoints and bucket data.

```changes
c3afc92
backend/docker-compose.yml
backend/powersync/service.dev.yaml
backend/powersync/service.prod.yaml
backend/powersync/sync-config.yaml
backend/scripts/powersync-init.sql
backend/Makefile
backend/.env.example
```
