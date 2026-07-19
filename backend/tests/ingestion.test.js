import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

import { parseWhatsAppWebhook } from '../src/channels/whatsapp/parser.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const fixture = (name) =>
  JSON.parse(readFileSync(join(__dir, 'fixtures/mercadophone', name), 'utf8'));

// ── parser: start ─────────────────────────────────────────────────────────────

test('parser: start → kind=lifecycle', () => {
  const body = fixture('01-start.json');
  const parsed = parseWhatsAppWebhook(body);

  assert.equal(parsed.kind, 'lifecycle');
  assert.equal(parsed.action, 'ticket_started');
  assert.equal(parsed.externalTicketId, '40583');
  assert.equal(parsed.lead.identifier, '5514991664662');
  assert.equal(parsed.lead.contactName, 'Cliente Teste');
});

// ── parser: mensagem de cliente ────────────────────────────────────────────────

test('parser: from_internal fromMe=false → kind=incoming', () => {
  const body = fixture('02-cliente-msg.json');
  const parsed = parseWhatsAppWebhook(body);

  assert.equal(parsed.kind, 'incoming');
  assert.equal(parsed.message.tipo, 'cliente');
  assert.equal(parsed.message.text, 'oi bom diaaa');
  assert.equal(
    parsed.message.externalMessageId,
    'wamid.HBgNNTUxNDk5MTY2NDY2MhUCABIYFDNCQUY2Q0RFREFCMUNEQjRDOEE4AA=='
  );
  assert.equal(parsed.lead.identifier, '5514991664662');
  assert.equal(parsed.externalTicketId, '40583');
});

// ── parser: echo da BIA ────────────────────────────────────────────────────────

test('parser: from_internal fromMe=true userId=null → kind=echo bia_echo', () => {
  const body = fixture('03-bia-echo.json');
  const parsed = parseWhatsAppWebhook(body);

  assert.equal(parsed.kind, 'echo');
  assert.equal(parsed.isHumanAttendantOnMercadoPhone, false);
  assert.equal(parsed.message.tipo, 'bia_echo');
  assert.equal(
    parsed.message.externalMessageId,
    'wamid.HBgNNTUxNDk5MTY2NDY2MhUCABEYEjI4QUZBMkI2M0I0RTBBODc1RAA='
  );
});

// ── parser: echo de atendente humano ──────────────────────────────────────────

test('parser: from_internal fromMe=true userId≠null → kind=echo atendente', () => {
  const body = { ...fixture('03-bia-echo.json'), userId: 'atendente_42' };
  const parsed = parseWhatsAppWebhook(body);

  assert.equal(parsed.kind, 'echo');
  assert.equal(parsed.isHumanAttendantOnMercadoPhone, true);
  assert.equal(parsed.message.tipo, 'atendente');
});

// ── parser: acao desconhecida ──────────────────────────────────────────────────

test('parser: acao desconhecida → kind=unknown', () => {
  const parsed = parseWhatsAppWebhook({ acao: 'transferencia', fromMe: false });

  assert.equal(parsed.kind, 'unknown');
  assert.equal(parsed.rawAcao, 'transferencia');
});
