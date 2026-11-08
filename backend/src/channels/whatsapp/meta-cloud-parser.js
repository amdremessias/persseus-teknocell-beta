function messageText(message) {
  if (message?.type === 'text') return String(message.text?.body || '').trim();
  if (message?.type === 'interactive') {
    return String(message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || '').trim();
  }
  return '';
}

export function parseMetaCloudWebhook(body) {
  const parsed = [];
  for (const entry of Array.isArray(body?.entry) ? body.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const value = change?.value || {};
      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      for (const message of Array.isArray(value.messages) ? value.messages : []) {
        const id = String(message?.id || '').trim();
        const from = String(message?.from || '').replace(/\D/g, '');
        const text = messageText(message);
        if (!id || !from || !text) continue;
        const contact = contacts.find((item) => String(item?.wa_id || '').replace(/\D/g, '') === from);
        parsed.push({ id, from, name: String(contact?.profile?.name || '').trim(), text });
      }
    }
  }
  return parsed;
}
