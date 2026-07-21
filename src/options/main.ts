export {};

const DISPLAY_MODE_KEY = "displayMode";
const inputs = document.querySelectorAll<HTMLInputElement>(
  'input[name="displayMode"]',
);
const statusElement = document.getElementById("status");

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
