import { openUrl } from "@tauri-apps/plugin-opener";

// Open an external URL in the user's default browser. A bare <a target="_blank"> is
// unreliable inside the Tauri webview, so route through the opener plugin (the
// `opener:default` capability is granted in src-tauri/capabilities). Failures are
// swallowed — opening a link should never surface an error dialog.
export function openExternal(url: string): void {
  void openUrl(url).catch(() => {});
}
