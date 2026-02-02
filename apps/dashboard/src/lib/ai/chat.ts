import { getAnthropicClient, MODEL, MODEL_DEEP } from './client';
import { buildSystemPrompt } from './system-prompt';
import type { ChatMessage, ServiceContext } from './index';

/**
 * AI Chat for service analysis
 */
export async function chat(
  messages: ChatMessage[],
  serviceContext?: ServiceContext
): Promise<string> {
  const systemPrompt = buildSystemPrompt(serviceContext);

  const response = await getAnthropicClient().messages.create({
    model: MODEL_DEEP,
    max_tokens: 2048,
    system: systemPrompt,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content,
    })),
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type');
  }

  return content.text;
}

/**
 * Stream AI Chat response
 */
export async function* chatStream(
  messages: ChatMessage[],
  serviceContext?: ServiceContext
): AsyncGenerator<string> {
  const systemPrompt = buildSystemPrompt(serviceContext);

  const stream = await getAnthropicClient().messages.stream({
    model: MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content,
    })),
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield event.delta.text;
    }
  }
}
