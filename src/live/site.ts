/** Texel site used for share links and live-session URLs: $TEXEL_SITE, the build-time SITE_URL, or production. */
export const SITE_ORIGIN = (process.env.TEXEL_SITE || (typeof __TEXEL_SITE__ === 'string' && __TEXEL_SITE__) || 'https://www.texel.dev.br').replace(/\/$/, '');
