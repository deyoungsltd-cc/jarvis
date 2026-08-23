// Sample plugin: Hello World
// Returns a greeting with the current timestamp
export default {
  name: 'hello_world',
  description: 'Returns a greeting with the current timestamp',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name to greet (default: World)' },
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      greeting: { type: 'string' },
      timestamp: { type: 'string' },
    },
  },
  riskLevel: 'low',
  async execute(input) {
    const name = input.name || 'World';
    return {
      success: true,
      output: {
        greeting: `Hello, ${name}! Welcome to JARVIS.`,
        timestamp: new Date().toISOString(),
      },
      durationMs: 0,
    };
  },
};
