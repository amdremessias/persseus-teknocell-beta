// rawPayload = uma entrada de messaging[] do webhook Meta:
// { sender: {id}, recipient: {id}, timestamp, message: {mid, text, attachments?, is_echo?} }
//
// Retorna o MESMO contrato do parser do WhatsApp (kind-based), consumido por
// core/ingestion.js: { kind, lead, message, externalTicketId }.
//  - is_echo=true    → kind 'echo'     (mensagem NOSSA ecoada pela Meta)
//  - is_echo ausente → kind 'incoming' (DM do cliente)
// A Meta não envia o nome no webhook → contactName fica null; a ingestão busca
// via Graph API (channels/instagram/profile.js) na criação do lead.
export function parseInstagramWebhook(rawPayload) {
  const { sender, recipient, message } = rawPayload;

  const fromMe     = Boolean(message?.is_echo);
  const identifier = fromMe ? recipient?.id : sender?.id;
  const eventId    = message?.mid;
  const texto      = message?.text || null;
  const mediaUrl   = message?.attachments?.[0]?.payload?.url || null;

  if (!eventId)    throw new Error('[instagram:parser] message.mid ausente');
  if (!identifier) throw new Error('[instagram:parser] identifier (sender/recipient.id) ausente');

  const lead = {
    identifier,
    contactName: null,          // preenchido via Graph API na ingestão
    detectedCanal: 'instagram',
    mercadophoneTicketId: null, // Instagram direto (Graph) não passa por ticket MercadoPhone
  };

  if (fromMe) {
    return {
      kind: 'echo',
      isHumanAttendantOnMercadoPhone: false, // IG não distingue atendente/bot no echo
      lead,
      message: { externalMessageId: eventId, text: texto, mediaUrl, tipo: 'atendente' },
      externalTicketId: null,
    };
  }

  return {
    kind: 'incoming',
    lead,
    message: { externalMessageId: eventId, text: texto, mediaUrl, tipo: 'cliente' },
    externalTicketId: null,
  };
}
