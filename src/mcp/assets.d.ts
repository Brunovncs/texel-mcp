declare module '*.md' {
  const text: string;
  export default text;
}

/** Self-contained MCP App viewer document, injected at bundle time. */
declare const __TEXEL_VIEWER_HTML__: string;
declare const __TEXEL_VERSION__: string;
