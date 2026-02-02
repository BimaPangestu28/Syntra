import Anthropic from '@anthropic-ai/sdk';

function createClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY environment variable is not set. AI features will not work.'
    );
  }
  return new Anthropic({ apiKey });
}

// Lazy singleton — only throws when first AI call is made, not at import time
let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    _client = createClient();
  }
  return _client;
}

export const MODEL = 'claude-3-5-haiku-20241022';
export const MODEL_DEEP = 'claude-sonnet-4-20250514';
