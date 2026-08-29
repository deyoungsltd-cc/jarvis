const VALID_SCOPES = ['working', 'episodic', 'semantic', 'preference', 'project'];

export async function GET() {
  return Response.json({ scopes: VALID_SCOPES });
}
