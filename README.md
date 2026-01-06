# Registry Server

[![Coverage Status](https://coveralls.io/repos/github/decentraland/asset-bundle-registry/badge.svg)](https://coveralls.io/github/decentraland/asset-bundle-registry)

This server is hooked into the event-driven architecture to listen for [Catalysts'](https://github.com/decentraland/catalyst) and [World Content Server's](https://github.com/decentraland/worlds-content-server) entities deployments in order to act as a gateway to retrieve the latest available version of these entities.

Each entity has its specific way to determine its own latest version. Most of them depends on [Asset Bundles conversions](https://github.com/decentraland/asset-bundle-converter), therefore this server also listens to the events being reported by these services to make them available to clients once all the optimizations are already in place.

## Table of Contents

- [Features](#features)
- [Dependencies & Related Services](#dependencies--related-services)
- [API Documentation](#api-documentation)
- [Database](#database)
  - [Schema](#schema)
  - [Migrations](#migrations)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Configuration](#configuration)
  - [Running the Service](#running-the-service)
- [Testing](#testing)
  - [Running Tests](#running-tests)
  - [Test Structure](#test-structure)
- [AI Agent Context](#ai-agent-context)

## Features

- **Bundles registry**: Provides an endpoint to retrieve latest optimized version of scenes, emotes, wearables and worlds entities.
- **Bundles state transition**: Listen for events regarding entities deployments and bundles optimizations to transition state of entities stored in the database in order to ensure their latest version is always returned.
- **Profiles registry**: Provides an endpoint to retrieve validated Catalysts' profiles.
- **Profiles sync**: Polls entities from all Catalysts to react over new profiles deployments to store them in a multi-layer storage (memory cache and database).
- **Profiles curation**: Triggers a job every N minutes to validate ownership of all profiles stored in the rapid access cache.

## Dependencies & Related Services

This service interacts with the following services:

- **[Deployments to SQS](https://github.com/decentraland/deployments-to-sqs)**: Listens for events triggered by this service to react over new Catalyst deployments
- **[World Content Server](https://github.com/decentraland/worlds-content-server)**: Listens for events triggered by this server to react over new Worlds deployments
- **[Asset Bundle Converter](https://github.com/decentraland/asset-bundle-converter)**: Listens for events triggered by these services to react over bundle optimizations
- **[Catalyst](https://github.com/decentraland/catalyst)**: Used to validate received entities deployments and sanitize profiles stored in the cache

External dependencies:

- SNS and SQS from AWS Cloud Provider
- PostgreSQL
- Redis

## API Documentation

The API is fully documented using the [OpenAPI standard](https://swagger.io/specification/). Its schema is located at [docs/openapi.yaml](docs/openapi.yaml).

## Database

### Schema

See [docs/database-schemas.md](docs/database-schemas.md) for detailed schema, column definitions, and relationships

### Migrations

The service uses `node-pg-migrate` for database migrations. These migrations are located in `src/migrations/`. The service automatically runs the migrations when starting up.

It also exposes [scripts](./src/scripts/README.md) to nurture the database with deployments exported from Catalyst.

#### Create a new migration

Migrations are created by running the create command:

```bash
yarn migrate create name-of-the-migration
```

This will result in the creation of a migration file inside of the `src/migrations/` directory. This migration file MUST contain the migration set up and rollback procedures.

#### Manually applying migrations

If required, these migrations can be run manually.

To run them manually:

```bash
yarn migrate up
```

To rollback them manually:

```bash
yarn migrate down
```

## Getting Started

### Prerequisites

Before running this service, ensure you have the following installed:

- **Node.js**: Version 20.x or higher (LTS recommended)
- **Yarn**: Version 1.22.x or higher
- **Docker**: For containerized deployment

<!-- List any other dependencies that are required to run the service -->

### Installation

1. Clone the repository:

```bash
git clone https://github.com/decentraland/asset-bundle-registry.git
cd asset-bundle-registry
```

2. Install dependencies:

```bash
yarn install
```

3. Build the project:

```bash
yarn build
```

### Configuration

The service uses environment variables for configuration.
Create a `.env` file in the root directory containing the environment variables for the service to run.
Use the `.env.default` variables as an example.

### Running the Service

#### Setting up the environment

In order to successfully run this server, external dependencies such as databases, memory storages and such must be provided.
To do so, this repository provides you with a `docker-compose` file for that purpose. In order to get the environment set up, run:

```bash
docker-compose up
```

#### Running in development mode

To run the service in development mode:

```bash
yarn start:dev
```

## Testing

This service includes comprehensive test coverage with both unit and integration tests.

### Running Tests

Run all tests with coverage:

```bash
yarn test
```

Run tests in watch mode:

```bash
yarn test --watch
```

Run only unit tests:

```bash
yarn test test/unit
```

Run only integration tests:

```bash
yarn test test/integration
```

### Test Structure

- **Unit Tests** (`test/unit/`): Test individual components and functions in isolation
- **Integration Tests** (`test/integration/`): Test the complete request/response cycle

For detailed testing guidelines and standards, refer to our [Testing Standards](https://github.com/decentraland/docs/tree/main/development-standards/testing-standards) documentation.

## AI Agent Context

For detailed AI Agent context, see [docs/ai-agent-context.md](docs/ai-agent-context.md).