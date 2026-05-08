// Use dynamic require() so @azure/cosmos is only loaded when
// a function actually calls getTrailsContainer(), not at worker startup.
// This prevents "Backend call failure" caused by startup crashes.

let _container: any = null

export function getTrailsContainer(): any {
  if (_container) return _container

  const endpoint = process.env['COSMOS_ENDPOINT']
  const key      = process.env['COSMOS_KEY']
  if (!endpoint || !key) throw new Error('Missing COSMOS_ENDPOINT or COSMOS_KEY env vars')

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { CosmosClient } = require('@azure/cosmos')
  const dbName        = process.env['COSMOS_DATABASE'] ?? 'wahiking'
  const containerName = process.env['COSMOS_CONTAINER'] ?? 'trails'

  const client = new CosmosClient({ endpoint, key })
  _container   = client.database(dbName).container(containerName)
  return _container
}
