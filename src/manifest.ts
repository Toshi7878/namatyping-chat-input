import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "YouTube Live Chat Input",
  description: "YouTube Live のチャットを専用ウィンドウから送信します。",
  version: "1.0.0",
  minimum_chrome_version: "102",
  action: {
    default_title: "チャット入力を開く",
  },
  background: {
    service_worker: "src/background.ts",
    type: "module",
  },
  permissions: ["scripting", "tabs", "webNavigation"],
  host_permissions: ["https://www.youtube.com/*"],
  content_scripts: [
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
});
