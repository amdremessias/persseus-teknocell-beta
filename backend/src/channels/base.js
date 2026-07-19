export class ChannelAdapter {
  get canal() { throw new Error('implementar: canal'); }

  // rawPayload → { eventId, identifier, contactName, texto, mediaUrl, fromMe, timestamp, raw }
  parseWebhook(_rawPayload) {
    throw new Error('implementar: parseWebhook');
  }

  // → { success, externalMessageId, error }
  async sendMessage(_opts) {
    throw new Error('implementar: sendMessage');
  }
}
