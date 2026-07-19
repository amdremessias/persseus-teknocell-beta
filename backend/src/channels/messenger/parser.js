// TODO: configurar credenciais Messenger em ChannelConfig (canal: messenger)
// Formato idêntico ao Instagram — Meta unificou os webhooks no Graph API
export function parseMessengerWebhook(rawPayload) {
  const { sender, recipient, timestamp, message } = rawPayload;

  const fromMe = Boolean(message?.is_echo);
  const identifier = fromMe ? recipient?.id : sender?.id;
  const eventId = message?.mid;
  const texto = message?.text || null;
  const mediaUrl = message?.attachments?.[0]?.payload?.url || null;

  if (!eventId) throw new Error('[messenger:parser] message.mid ausente');
  if (!identifier) throw new Error('[messenger:parser] identifier (sender/recipient.id) ausente');

  return {
    eventId,
    identifier,
    contactName: null,
    texto,
    mediaUrl,
    fromMe,
    timestamp: timestamp ? Math.floor(timestamp / 1000) : Math.floor(Date.now() / 1000),
    raw: rawPayload,
  };
}
