# AI Agent Context

**Service Purpose:** Orchestrates and tracks the availability of optimized Decentraland entities (scenes, worlds, wearables, emotes, and profiles). Acts as a state management service that coordinates between entity deployments, optimization services (Asset Bundle Converter, LODs Generator), and client requests, ensuring optimized content is always available.

**Key Capabilities:**

- Tracks optimization status (pending/complete/failed) for Asset Bundles and LODs across platforms (Windows, Mac, WebGL)
- Manages entity registry with deployer ownership, pointers, and optimization state transitions
- Listens to SQS messages for deployment events and `AssetBundleConversionFinished` events
- Provides REST API for querying entity optimization status by owner or entity ID
- Handles state rotation when entities are redeployed (marks previous as obsolete, creates new registry entry)
- Manages historical deployment records for audit and analytics
- Integrates with Catalyst to fetch entity metadata and validate deployments
- Integrates with Catalyst to periodically fetch and validate profiles

**Communication Pattern:** 
- Event-driven via AWS SQS/SNS (deployment events, conversion completion events)
- Synchronous HTTP REST API (status queries, admin registry operations)

**Technology Stack:**

- Runtime: Node.js
- Language: TypeScript 5.x
- HTTP Framework: @dcl/http-server
- Database: PostgreSQL (via @well-known-components/pg-component)
- Cache: Redis (queue status management) with in-memory fallback
- Component Architecture: @well-known-components (logger, metrics, http-server, env-config-provider)

**External Dependencies:**

- Databases: PostgreSQL (entity registry, optimization status, historical records)
- Queue: AWS SQS (deployment events from deployments-to-sqs service)
- Event Bus: AWS SNS (receives AssetBundleConversionFinished events from Asset Bundle Converter)
- Content Server: Catalyst Load Balancer (fetches entity metadata)
- CDN: Asset Bundle CDN (queries bundle availability)
- Worlds: Worlds Content Server (for world deployment handling)
- Catalyst: DAO Catalysts to fetch and validate entities

**Project Structure:**

- `adapters/`: Database, Catalyst, SQS, Redis, Worlds integrations
- `controllers/`: HTTP handlers for status endpoints, admin operations
- `logic/`: Message processing, registry orchestration, entity status fetching, worker management
- `logic/sync`: Components and modules handling Profiles syncing and curation
- `migrations/`: PostgreSQL schema migrations
- `scripts/`: Utility scripts for populating registry from CSV/manifests

**API Specification:** See `docs/openapi.yaml` for complete API documentation
