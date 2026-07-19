// TODO: configurar TikTok Business API token em ChannelConfig (canal: tiktok)
// Ref: https://developers.tiktok.com/doc/tiktok-business-messaging
export function parseTikTokWebhook(_rawPayload) {
  throw new Error('[tiktok:parser] canal não configurado — adicione credenciais em ChannelConfig');
}
