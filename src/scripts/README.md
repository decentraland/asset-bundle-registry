# Asset Bundle Registry Scripts

This directory contains utility scripts for populating the Asset Bundle Registry with entities from different sources. These scripts run locally but interact with remote Asset Bundle Registry instances (development, staging, or production) to create the necessary registries.

## Available Scripts

### 1. Populate Items (Wearables/Emotes)
```bash
yarn scripts:populate-items <csv_file_path>
```

This script processes wearables or emotes from a CSV file exported from Catalyst's deployments collection.

#### Required Environment Variables:
- `REGISTRY_URL`: URL of the target Asset Bundle Registry instance (e.g., development, staging, or production)
- `API_ADMIN_TOKEN`: Admin token for authentication against the target instance

#### CSV File Format:
The CSV file should contain the following columns:
- `entity_id`: The unique identifier of the entity

Example:
```csv
entity_id
bafkreia3v2yf7lrxebuq5zrtjvhkta4ryxgtlyg7avyxzxqw4gh2vz7joi
bafkreib4nqysdxkg2qbeeigu7yj6xdhk5jkqvj4vkgbvhqxj6kq5yfm5ry
```

### 2. Populate Scenes
```bash
yarn scripts:populate-scenes
```

This script fetches scenes from the World Manifest and creates registries for all scenes listed in the `occupied` property of the manifest.

#### Required Environment Variables:
- `REGISTRY_URL`: URL of the target Asset Bundle Registry instance (e.g., development, staging, or production)
- `API_ADMIN_TOKEN`: Admin token for authentication against the target instance
- `WORLD_MANIFEST_URL`: URL to fetch the world manifest containing scene pointers

#### Output:
The script generates a `scenes-processor-missing-pointers.json` file containing any pointers that don't have corresponding entities.

## Common Features

- Both scripts process entities in batches of 100
- Includes retry mechanism with exponential backoff (3 retries, starting at 1 second)
- Logs progress and errors through the logger component

## Error Handling

- CSV parsing errors will be reported with "Could not read or parse the CSV file"
- Network errors will be retried 3 times before failing
- Invalid responses from the registry will be logged with their status codes

## Example Usage

1. Set up environment variables in `.env` (example using staging environment):
```env
REGISTRY_URL=asset-bundle-registry-url
API_ADMIN_TOKEN=your-admin-token
WORLD_MANIFEST_URL=world-manifest-url
```

2. Run the scripts:
```bash
# Process wearables
yarn scripts:populate-items ./wearables.csv

# Process scenes
yarn scripts:populate-scenes
```
