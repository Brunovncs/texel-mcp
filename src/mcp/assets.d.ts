declare module '*.md' {
  const text: string;
  export default text;
}

/** Self-contained MCP App viewer document, injected at bundle time. */
declare const __TEXEL_VIEWER_HTML__: string;
/** The live session's page, injected at bundle time. */
declare const __TEXEL_LIVE_HTML__: string;
declare const __TEXEL_VERSION__: string;
/** Deployment origin (SITE_URL at build time), used for share links and live sessions. */
declare const __TEXEL_SITE__: string;
