import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractChatCompletionContent, normalizeChatCompletionsUrl } from '../src/core/llm-gateway.js';

test('gateway URL accepts host, /v1 and full completion path', () => {
  assert.equal(normalizeChatCompletionsUrl('https://llm.example'), 'https://llm.example/v1/chat/completions');
  assert.equal(normalizeChatCompletionsUrl('https://llm.example/v1'), 'https://llm.example/v1/chat/completions');
  assert.equal(normalizeChatCompletionsUrl('https://llm.example/custom/chat/completions'), 'https://llm.example/custom/chat/completions');
});

test('gateway response accepts string and text-part content', () => {
  assert.equal(extractChatCompletionContent({ choices: [{ message: { content: ' resposta ' } }] }), 'resposta');
  assert.equal(extractChatCompletionContent({ choices: [{ message: { content: [{ type: 'text', text: 'ok' }] } }] }), 'ok');
  assert.equal(extractChatCompletionContent({ choices: [] }), '');
});
