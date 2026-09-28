import * as Localization from "expo-localization";

/**
 * Headers every native API call should carry.
 *
 * Only the native calls need this. The WebView sends its own Accept-Language
 * from the OS, and the web app's axios instance adds X-Anon-ID and
 * X-Zirkly-Platform on top — none of which reaches a request made from here
 * with `axios` or `fetch` directly.
 *
 * The backend records hd_language_setting per row, and without this it is
 * simply blank for everything the app does natively: record-login, device
 * registration, and the Google/Apple token exchanges.
 *
 * Deliberately NOT setting a User-Agent. Identifying the app there is what got
 * the WebView scored as a bot by Cloudflare Turnstile (see USER_AGENT_SUFFIX
 * in components/PersistentWebView.tsx); native calls are classified from their
 * CFNetwork/okhttp user agent instead, which the backend already reads.
 */

// Resolved once. The OS locale cannot change without the app restarting, and
// getLocales() is a bridge call we do not want on every request.
const ACCEPT_LANGUAGE = resolveAcceptLanguage();

function resolveAcceptLanguage(): string {
  try {
    const [primary] = Localization.getLocales();
    // languageTag is the full BCP 47 tag, e.g. en-AU. Fall back to the bare
    // language code, then to nothing at all rather than guessing a locale.
    return primary?.languageTag || primary?.languageCode || "";
  } catch {
    return "";
  }
}

export function clientHeaders(): Record<string, string> {
  return ACCEPT_LANGUAGE ? { "Accept-Language": ACCEPT_LANGUAGE } : {};
}
