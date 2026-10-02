export const CHAT_DISCLAIMER_KEY = "mathex-chat-disclaimer-dismissed";

export const CHAT_DISCLAIMER =
  "Player chat is not monitored by hosts. Tiger Maths is not responsible for any content sent through it.";

export function hasDismissedChatDisclaimer(): boolean {
  try {
    return localStorage.getItem(CHAT_DISCLAIMER_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissChatDisclaimer(): void {
  try {
    localStorage.setItem(CHAT_DISCLAIMER_KEY, "1");
  } catch {
    // Storage unavailable: show the disclaimer every time.
  }
}
