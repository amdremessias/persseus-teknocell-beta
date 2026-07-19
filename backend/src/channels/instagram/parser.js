// rawPayload = uma entrada de messaging[] do webhook Meta:
// { sender: {id}, recipient: {id}, timestamp, message: {mid, text, attachments?, is_echo?} }
export function parseInstagramWebhook(rawPayload) {
  const { sender, recipient, timestamp, message } = rawPayload;

  const fromMe = Boolean(message?.is_echo);
  const identifier = fromMe ? recipient?.id : sender?.id;
  const eventId = message?.mid;
  const texto = message?.text || null;
  const mediaUrl = message?.attachments?.[0]?.payload?.url || null;

  if (!eventId) throw new Error('[instagram:parser] message.mid ausente');
  if (!identifier) throw new Error('[instagram:parser] identifier (sender/recipient.id) ausente');

  return {
    eventId,
    identifier,
    contactName: null, // Meta não fornece nome no webhook; buscar via Graph API separadamente se necessário
    texto,
    mediaUrl,
    fromMe,
    timestamp: timestamp ? Math.floor(timestamp / 1000) : Math.floor(Date.now() / 1000),
    raw: rawPayload,
  };
}
