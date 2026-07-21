export {};

const DISPLAY_MODE_KEY = "displayMode";
const inputs = document.querySelectorAll<HTMLInputElement>(
  'input[name="displayMode"]',
);
const statusElement = document.getElementById("status");
const disconnectTwitchButton =
  document.querySelector<HTMLButtonElement>("#disconnectTwitch");

chrome.storage.local.get(DISPLAY_MODE_KEY).then((stored) => {
  const displayMode =
    stored[DISPLAY_MODE_KEY] === "popup" ? "popup" : "overlay";
  for (const input of inputs) input.checked = input.value === displayMode;
});

for (const input of inputs) {
  input.addEventListener("change", async () => {
    if (!input.checked) return;
    await chrome.storage.local.set({ [DISPLAY_MODE_KEY]: input.value });
    if (statusElement) {
      statusElement.textContent = "保存しました";
      setTimeout(() => {
        statusElement.textContent = "";
      }, 1500);
    }
  });
}

chrome.runtime
  .sendMessage({ type: "GET_TWITCH_AUTH_STATUS" })
  .then((response: { ok: boolean; authenticated: boolean }) => {
    if (disconnectTwitchButton) {
      disconnectTwitchButton.disabled = !response.authenticated;
    }
  })
  .catch(() => {
    if (disconnectTwitchButton) disconnectTwitchButton.disabled = true;
  });

disconnectTwitchButton?.addEventListener("click", async () => {
  disconnectTwitchButton.disabled = true;
  if (statusElement) statusElement.textContent = "連携を解除しています…";
  try {
    const response: { ok: boolean; error?: string } =
      await chrome.runtime.sendMessage({ type: "DISCONNECT_TWITCH" });
    if (!response.ok)
      throw new Error(response.error ?? "連携解除に失敗しました。");
    if (statusElement) statusElement.textContent = "Twitch連携を解除しました";
  } catch (error) {
    disconnectTwitchButton.disabled = false;
    if (statusElement) {
      statusElement.textContent =
        error instanceof Error ? error.message : String(error);
    }
  }
});
