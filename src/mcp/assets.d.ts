declare module '*.md' {
  const text: string;
  export default text;
}

/** Self-contained MCP App viewer document, injected at bundle time. */
declare const __SKINSMITH_VIEWER_HTML__: string;
declare const __SKINSMITH_VERSION__: string;
