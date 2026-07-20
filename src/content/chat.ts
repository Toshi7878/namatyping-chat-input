import type { ChatResponse, RuntimeMessage } from "../shared/messages";

const INPUT_SELECTORS = [
  "yt-live-chat-text-input-field-renderer #input[contenteditable='true']",
  "#input[contenteditable='true']",
  "[contenteditable='true'][role='textbox']",
  "yt-live-chat-text-input-field-renderer [contenteditable='true']",
];

const SEND_BUTTON_SELECTORS = [
  "#send-button button",
  "yt-live-chat-message-input-renderer #send-button",
];

chrome.runtime.onMessage.addListener(
  (
    message: RuntimeMessage,
    _sender,
    sendResponse: (response: ChatResponse) => void,
  ) => {
    if (message.type !== "CHAT_SEND") return false;
    sendThroughYouTubeUi(message.text).then(sendResponse);
    return true;
  },
);

async function sendThroughYouTubeUi(text: string): Promise<ChatResponse> {
  const input = await waitForElement<HTMLElement>(INPUT_SELECTORS, 5000);
  if (!input) {
    return {
      ok: false,
      error:
        "送信欄がありません。ログイン状態やチャットの利用制限を確認してください。",
    };
  }

  input.focus();
  input.textContent = "";
  const inserted = document.execCommand("insertText", false, text);
  if (!inserted) {
    input.textContent = text;
    input.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: text,
      }),
    );
  }

  const button = await waitForSendButton();
  if (!button) {
    return {
      ok: false,
      error:
        "送信ボタンが利用できません。文字数やチャット制限を確認してください。",
    };
  }

  button.click();
  return { ok: true };
}

async function waitForSendButton(): Promise<HTMLButtonElement | null> {
  const timeoutAt = Date.now() + 750;
  do {
    const button = findElementDeep<HTMLButtonElement>(SEND_BUTTON_SELECTORS);
    if (
      button &&
      !button.disabled &&
      button.getAttribute("aria-disabled") !== "true"
    ) {
      return button;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  } while (Date.now() < timeoutAt);
  return null;
}

async function waitForElement<T extends Element>(
  selectors: string[],
  timeoutMs: number,
): Promise<T | null> {
  const timeoutAt = Date.now() + timeoutMs;
  do {
    const element = findElementDeep<T>(selectors);
    if (element) return element;
    await new Promise((resolve) => setTimeout(resolve, 100));
  } while (Date.now() < timeoutAt);
  return null;
}

function findElementDeep<T extends Element>(selectors: string[]): T | null {
  const roots: ParentNode[] = [document];

  for (let index = 0; index < roots.length; index += 1) {
    const root = roots[index];
    for (const selector of selectors) {
      const element = root.querySelector<T>(selector);
      if (element) return element;
    }

    for (const element of root.querySelectorAll<HTMLElement>("*")) {
      if (element.shadowRoot) roots.push(element.shadowRoot);
    }
  }

  return null;
}
