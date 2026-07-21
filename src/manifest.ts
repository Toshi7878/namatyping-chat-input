import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "ニコタイチャット【YouTube|Twitch】",
  description: "YouTube・Twitchのページ内入力パネルからチャットを送信します。",
  version: "1.0.0",
  minimum_chrome_version: "102",
  icons: {
    128: "icons/nama-key-128.png",
  },
  action: {
    default_title: "チャット入力を開く",
    default_icon: "icons/nama-key-128.png",
  },
  background: {
    service_worker: "src/background.ts",
    type: "module",
  },
  options_ui: {
    page: "src/options/index.html",
    open_in_tab: false,
  },
  permissions: ["scripting", "storage", "tabs", "webNavigation"],
  host_permissions: [
    "https://www.youtube.com/*",
    "https://www.twitch.tv/*",
    "https://id.twitch.tv/*",
    "https://api.twitch.tv/*",
  ],
  content_scripts: [
    {
      matches: ["https://www.youtube.com/watch*", "https://www.twitch.tv/*"],
      js: ["src/content/overlay.ts"],
      run_at: "document_idle",
    },
    {
      matches: [
        "https://www.youtube.com/live_chat*",
        "https://www.youtube.com/live_chat_replay*",
      ],
      js: ["src/content/chat.ts"],
      all_frames: true,
      run_at: "document_idle",
    },
  ],
  web_accessible_resources: [
    {
      resources: ["src/window/index.html"],
      matches: ["https://www.youtube.com/*", "https://www.twitch.tv/*"],
    },
  ],
});
