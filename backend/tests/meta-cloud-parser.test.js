import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMetaCloudWebhook } from '../src/channels/whatsapp/meta-cloud-parser.js';

const wrap = (messages, contacts = []) => ({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { contacts, messages } }] }] });

test('Meta Cloud: extrai texto com nome e id para idempotência', () => {
  const result = parseMetaCloudWebhook(wrap(
    [{ id: 'wamid.1', from: '5511999999999', type: 'text', text: { body: 'Oi' } }],
    [{ wa_id: '5511999999999', profile: { name: 'Ana' } }],
  ));
  assert.deepEqual(result, [{ id: 'wamid.1', from: '5511999999999', name: 'Ana', text: 'Oi' }]);
});

test('Meta Cloud: reconhece respostas interativas e ignora status sem mensagem', () => {
  const result = parseMetaCloudWebhook(wrap([
    { id: 'wamid.2', from: '5511888888888', type: 'interactive', interactive: { button_reply: { title: 'Fazer pedido' } } },
  ]));
  assert.equal(result.length, 1);
  assert.equal(result[0].text, 'Fazer pedido');
  assert.deepEqual(parseMetaCloudWebhook({ entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.3' }] } }] }] }), []);
});
