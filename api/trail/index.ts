import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { getTrailsContainer } from '../shared/cosmosClient'
import { overlayRegionConditions } from '../shared/regionConditions'
import { applyTrailCorrection } from '../shared/trailCorrections'

async function trailHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return { status: 400, jsonBody: { error: 'Missing id parameter' } }

  try {
    const container = getTrailsContainer()
    const { resources } = await container.items
      .query({
        query: "SELECT * FROM t WHERE t.id = @id AND (NOT IS_DEFINED(t.docType) OR t.docType = 'trail')",
        parameters: [{ name: '@id', value: id }],
      }, { enableCrossPartitionQuery: true })
      .fetchAll()

    if (!resources.length) return { status: 404, jsonBody: { error: 'Trail not found' } }
    const [trail] = await overlayRegionConditions(container, [applyTrailCorrection(resources[0])])
    return { status: 200, jsonBody: trail }
  } catch (err) {
    context.error('GET /api/trail error', err)
    return { status: 500, jsonBody: { error: 'Database error' } }
  }
}

app.http('trail', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: trailHandler,
})
