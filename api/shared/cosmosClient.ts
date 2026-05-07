import { CosmosClient, Container, Database } from '@azure/cosmos'

let _db: Database | null = null
let _trailsContainer: Container | null = null

function getClient(): Database {
  if (_db) return _db
  const endpoint = process.env['COSMOS_ENDPOINT']
  const key = process.env['COSMOS_KEY']
  if (!endpoint || !key) throw new Error('Missing COSMOS_ENDPOINT or COSMOS_KEY env vars')
  const client = new CosmosClient({ endpoint, key })
  _db = client.database(process.env['COSMOS_DATABASE'] ?? 'wa-hiking')
  return _db
}

export function getTrailsContainer(): Container {
  if (_trailsContainer) return _trailsContainer
  _trailsContainer = getClient().container(process.env['COSMOS_CONTAINER'] ?? 'trails')
  return _trailsContainer
}
