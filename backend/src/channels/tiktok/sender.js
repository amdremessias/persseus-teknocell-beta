// TODO: configurar TIKTOK_TOKEN em ChannelConfig (canal: tiktok)
// Ref: https://developers.tiktok.com/doc/tiktok-business-messaging
export async function sendTikTokMessage({ identifier, texto, mediaUrl }) {
  console.warn('[tiktok:sender] canal não configurado — adicione TIKTOK_TOKEN em ChannelConfig');
  return { success: false, error: 'TikTok não configurado — adicione credenciais em ChannelConfig' };
}
