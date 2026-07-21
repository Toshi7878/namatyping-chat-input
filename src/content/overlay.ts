import type { RuntimeMessage, TwitchAuthResponse } from "../shared/messages";

const HOST_ID = "custom-yt-chat-input-overlay";
const SEND_WITH_ENTER_KEY = "sendWithEnter";
const FONT_SIZE_KEY = "fontSize";
const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 32;
let characterCounter: HTMLSpanElement | null = null;
let twitchAuthButton: HTMLButtonElement | null = null;

chrome.storage.local.onChanged.addListener((changes) => {
  if (changes.twitchAuth && twitchAuthButton) {
    const authenticated = Boolean(changes.twitchAuth.newValue);
    twitchAuthButton.hidden = authenticated;
    if (!authenticated) {
      twitchAuthButton.textContent = "使用するにはTwitch認証してください";
      twitchAuthButton.disabled = false;
    }
  }
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage) => {
  if (message.type === "CLOSE_CHAT_OVERLAY") {
    document.getElementById(HOST_ID)?.remove();
    characterCounter = null;
    return false;
  }
  if (message.type === "TEXT_COUNT_UPDATED") {
    if (characterCounter) {
      characterCounter.textContent = `${message.count} / ${message.limit}`;
      characterCounter.classList.toggle(
        "near-limit",
        message.count <= message.limit && message.limit - message.count <= 10,
      );
      characterCounter.classList.toggle(
        "over-limit",
        message.count > message.limit,
      );
    }
    return false;
  }
  if (message.type !== "TOGGLE_CHAT_OVERLAY") return false;

  const existing = document.getElementById(HOST_ID);
  if (existing) {
    existing.remove();
  } else {
    void showOverlay(message.tabId);
  }
  return false;
});

async function showOverlay(tabId: number): Promise<void> {
  const host = document.createElement("div");
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    .panel {
      position: fixed;
      right: 0;
      bottom: 0;
      z-index: 2147483647;
      display: flex;
      width: min(560px, calc(100vw - 24px));
      height: 135px;
      min-width: 320px;
      min-height: 108px;
      max-width: calc(100vw - 8px);
      max-height: calc(100vh - 8px);
      flex-direction: column;
      overflow: hidden;
      border: 1px solid #3f3f3f;
      border-radius: 14px;
      background: #0f0f0f;
      box-shadow: 0 12px 48px rgb(0 0 0 / 45%);
    }
    .bar {
      display: flex;
      height: 26px;
      align-items: center;
      justify-content: space-between;
      background: #212121;
      padding: 0 5px 0 9px;
      color: #f1f1f1;
      font: 11px/1 system-ui, sans-serif;
      user-select: none;
    }
    .drag-handle {
      display: flex;
      height: 100%;
      flex: 1;
      align-items: center;
      cursor: move;
    }
    .controls { display: flex; align-items: center; gap: 7px; }
    .font-counter {
      display: flex;
      align-items: center;
      gap: 2px;
      color: #aaa;
      font: 11px/1 system-ui, sans-serif;
    }
    .counter-button {
      width: 20px;
      height: 20px;
      border: 0;
      border-radius: 4px;
      background: transparent;
      color: #aaa;
      font: 16px/1 system-ui, sans-serif;
      cursor: pointer;
    }
    .counter-button:hover { background: #3f3f3f; color: #fff; }
    .counter-button:disabled { color: #555; cursor: default; }
    .font-size { width: 20px; text-align: center; }
    .character-counter {
      min-width: 48px;
      color: #aaa;
      font: 10px/1 system-ui, sans-serif;
      text-align: right;
      white-space: nowrap;
    }
    .character-counter.near-limit { color: #ffd54f; font-weight: 700; }
    .character-counter.over-limit { color: #ff6b6b; font-weight: 700; }
    .auth-button {
      height: 20px;
      border: 0;
      border-radius: 4px;
      background: #9147ff;
      padding: 0 7px;
      color: #fff;
      font: 10px/1 system-ui, sans-serif;
      cursor: pointer;
    }
    .auth-button:disabled { background: #444; color: #aaa; cursor: default; }
    .switch-label {
      display: flex;
      align-items: center;
      gap: 6px;
      color: #aaa;
      font-size: 10px;
      cursor: pointer;
    }
    .switch-label input { position: absolute; width: 1px; height: 1px; opacity: 0; }
    .switch {
      position: relative;
      width: 28px;
      height: 14px;
      border-radius: 999px;
      background: #555;
    }
    .switch::after {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #fff;
      content: "";
      transition: transform 120ms ease;
    }
    .switch-label input:checked + .switch { background: #3ea6ff; }
    .switch-label input:checked + .switch::after { transform: translateX(14px); }
    .switch-label input:focus-visible + .switch { outline: 2px solid #fff; }
    .close {
      display: grid;
      width: 22px;
      height: 22px;
      place-items: center;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: #aaa;
      font: 18px/1 sans-serif;
      cursor: pointer;
    }
    .close:hover { background: #3f3f3f; color: #fff; }
    iframe { display: block; width: 100%; min-height: 0; flex: 1; border: 0; }
    .resize-handle {
      position: absolute;
      right: 0;
      bottom: 0;
      z-index: 2;
      width: 18px;
      height: 18px;
      cursor: nwse-resize;
    }
    .resize-handle::after {
      position: absolute;
      right: 4px;
      bottom: 4px;
      width: 7px;
      height: 7px;
      border-right: 2px solid #777;
      border-bottom: 2px solid #777;
      content: "";
    }
    @media (prefers-color-scheme: light) {
      .panel {
        border-color: #bbb;
        background: #fff;
        box-shadow: 0 12px 48px rgb(0 0 0 / 22%);
      }
      .bar {
        background: #f2f2f2;
        color: #111;
      }
      .font-counter,
      .character-counter,
      .switch-label {
        color: #606060;
      }
      .counter-button { color: #555; }
      .counter-button:hover,
      .close:hover { background: #ddd; color: #111; }
      .counter-button:disabled { color: #bbb; }
      .switch { background: #aaa; }
      .close { color: #666; }
      .resize-handle::after { border-color: #777; }
      .character-counter.near-limit { color: #b26a00; }
      .character-counter.over-limit { color: #d93025; }
    }
  `;

  const panel = document.createElement("section");
  panel.className = "panel";
  panel.setAttribute("aria-label", "ニコタイチャット");

  const bar = document.createElement("div");
  bar.className = "bar";
  const title = document.createElement("span");
  title.className = "drag-handle";
  title.textContent = "ニコタイチャット";

  const controls = document.createElement("div");
  controls.className = "controls";
  const switchLabel = document.createElement("label");
  switchLabel.className = "switch-label";
  const switchText = document.createElement("span");
  const switchInput = document.createElement("input");
  switchInput.type = "checkbox";
  switchInput.setAttribute("role", "switch");
  const stored = await chrome.storage.local.get([
    SEND_WITH_ENTER_KEY,
    FONT_SIZE_KEY,
  ]);
  switchInput.checked = stored[SEND_WITH_ENTER_KEY] === true;
  switchInput.setAttribute("aria-checked", String(switchInput.checked));
  switchText.textContent = switchInput.checked ? "Enter" : "Ctrl+Enter";
  const switchVisual = document.createElement("span");
  switchVisual.className = "switch";
  switchVisual.setAttribute("aria-hidden", "true");
  switchInput.addEventListener("change", () => {
    switchInput.setAttribute("aria-checked", String(switchInput.checked));
    switchText.textContent = switchInput.checked ? "Enter" : "Ctrl+Enter";
    void chrome.storage.local.set({
      [SEND_WITH_ENTER_KEY]: switchInput.checked,
    });
  });
  switchLabel.append(switchText, switchInput, switchVisual);

  let fontSize =
    typeof stored[FONT_SIZE_KEY] === "number" ? stored[FONT_SIZE_KEY] : 18;
  const fontCounter = document.createElement("div");
  fontCounter.className = "font-counter";
  const decrease = document.createElement("button");
  decrease.type = "button";
  decrease.className = "counter-button";
  decrease.setAttribute("aria-label", "文字を小さくする");
  decrease.textContent = "−";
  const fontSizeText = document.createElement("span");
  fontSizeText.className = "font-size";
  const increase = document.createElement("button");
  increase.type = "button";
  increase.className = "counter-button";
  increase.setAttribute("aria-label", "文字を大きくする");
  increase.textContent = "+";

  const updateFontSize = (nextSize: number) => {
    fontSize = Math.min(Math.max(nextSize, MIN_FONT_SIZE), MAX_FONT_SIZE);
    fontSizeText.textContent = String(fontSize);
    decrease.disabled = fontSize <= MIN_FONT_SIZE;
    increase.disabled = fontSize >= MAX_FONT_SIZE;
    panel.style.height = `${54 + fontSize * 4.5}px`;
    void chrome.storage.local.set({ [FONT_SIZE_KEY]: fontSize });
  };
  decrease.addEventListener("click", () => updateFontSize(fontSize - 1));
  increase.addEventListener("click", () => updateFontSize(fontSize + 1));
  updateFontSize(fontSize);
  fontCounter.append(decrease, fontSizeText, increase);

  characterCounter = document.createElement("span");
  characterCounter.className = "character-counter";
  characterCounter.textContent = location.hostname.endsWith("twitch.tv")
    ? "0 / 500"
    : "0 / 200";

  const authButton = document.createElement("button");
  twitchAuthButton = authButton;
  authButton.type = "button";
  authButton.className = "auth-button";
  authButton.textContent = "確認中…";
  authButton.disabled = true;
  if (
    location.hostname === "www.twitch.tv" ||
    location.hostname === "twitch.tv"
  ) {
    const updateAuthButton = (authenticated: boolean) => {
      if (authenticated) {
        authButton.hidden = true;
        return;
      }
      authButton.hidden = false;
      authButton.textContent = "使用するにはTwitch認証してください";
      authButton.disabled = false;
    };
    chrome.runtime
      .sendMessage({ type: "GET_TWITCH_AUTH_STATUS" } satisfies RuntimeMessage)
      .then((response: TwitchAuthResponse) =>
        updateAuthButton(response.ok && response.authenticated),
      )
      .catch(() => updateAuthButton(false));
    authButton.addEventListener("click", async () => {
      authButton.textContent = "認証中…";
      authButton.disabled = true;
      try {
        const response: TwitchAuthResponse = await chrome.runtime.sendMessage({
          type: "AUTHENTICATE_TWITCH",
        } satisfies RuntimeMessage);
        updateAuthButton(response.ok && response.authenticated);
        if (!response.ok) authButton.title = response.error;
      } catch (error) {
        updateAuthButton(false);
        authButton.title =
          error instanceof Error ? error.message : String(error);
      }
    });
  }

  const close = document.createElement("button");
  close.type = "button";
  close.className = "close";
  close.setAttribute("aria-label", "閉じる");
  close.textContent = "×";
  close.addEventListener("click", () => host.remove());
  if (location.hostname.endsWith("twitch.tv")) controls.append(authButton);
  controls.append(characterCounter, fontCounter, switchLabel, close);
  bar.append(title, controls);

  const frame = document.createElement("iframe");
  frame.src = chrome.runtime.getURL(
    `src/window/index.html?tabId=${encodeURIComponent(tabId)}&view=overlay`,
  );
  frame.title = "チャット入力";

  const resizeHandle = document.createElement("div");
  resizeHandle.className = "resize-handle";
  resizeHandle.setAttribute("aria-hidden", "true");

  panel.append(bar, frame, resizeHandle);
  shadow.append(style, panel);
  document.documentElement.append(host);
  enableDragging(panel, title);
  enableResizing(panel, resizeHandle);
}

function enableDragging(panel: HTMLElement, handle: HTMLElement): void {
  handle.addEventListener("pointerdown", (event) => {
    const rect = panel.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    handle.setPointerCapture(event.pointerId);

    const move = (moveEvent: PointerEvent) => {
      const left = Math.min(
        Math.max(0, moveEvent.clientX - offsetX),
        window.innerWidth - panel.offsetWidth,
      );
      const top = Math.min(
        Math.max(0, moveEvent.clientY - offsetY),
        window.innerHeight - panel.offsetHeight,
      );
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
    };

    const stop = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
      handle.removeEventListener("pointercancel", stop);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
  });
}

function enableResizing(panel: HTMLElement, handle: HTMLElement): void {
  handle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    const rect = panel.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.top}px`;
    panel.style.width = `${rect.width}px`;
    panel.style.height = `${rect.height}px`;
    handle.setPointerCapture(event.pointerId);

    const move = (moveEvent: PointerEvent) => {
      const maxWidth = window.innerWidth - rect.left;
      const maxHeight = window.innerHeight - rect.top;
      const width = Math.min(
        Math.max(320, rect.width + moveEvent.clientX - startX),
        maxWidth,
      );
      const height = Math.min(
        Math.max(108, rect.height + moveEvent.clientY - startY),
        maxHeight,
      );
      panel.style.width = `${width}px`;
      panel.style.height = `${height}px`;
    };

    const stop = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
      handle.removeEventListener("pointercancel", stop);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
  });
}
