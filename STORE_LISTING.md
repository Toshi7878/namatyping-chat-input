# Chrome Web Store 掲載情報案

## 名前

namaTyping – Live Chat Input

## 概要

YouTube LiveとTwitchのチャットを、配信ページ内の見やすい入力欄からすばやく送信できます。

## 詳細説明

namaTyping – Live Chat Inputは、YouTube LiveとTwitchの配信ページにチャット専用の入力パネルを追加します。

- ページ右下に入力パネルを表示
- EnterまたはCtrl/Cmd + Enter送信を選択可能
- 入力文字サイズを12〜32pxで調整可能
- 文字サイズに合わせた3行入力欄
- パネルの移動とリサイズに対応
- 設定をブラウザー内へ保存
- Twitchは公式APIとOAuth認証を使用

拡張機能アイコンをクリックするとパネルを開閉できます。メッセージは利用者が送信操作を行った場合にのみ、現在開いている配信へ送信されます。

本拡張機能はYouTubeまたはTwitchによって提供、承認、提携されているものではありません。

## 単一の目的

YouTube LiveおよびTwitchのチャットメッセージを、配信ページ内の専用入力パネルから送信しやすくすること。

## 権限の理由

- `storage`: 送信キー、文字サイズ、Twitch OAuth認証情報を利用者のブラウザー内へ保存するため。
- `scripting`: 利用者が確定したYouTubeチャットメッセージを、対象のチャットフレームから送信するため。
- `tabs`: 現在開いている配信タブを特定し、Twitch認証ページを開くため。
- `webNavigation`: YouTube Liveのチャットフレームを特定するため。
- YouTube/Twitchホスト権限: 対応する配信ページへ入力パネルを表示し、チャットを送信するため。
- Twitch OAuth/APIホスト権限: Twitch認証および公式チャットAPIを利用するため。

## プライバシーポリシーURL

https://github.com/toshi7878/custom-yt-chat-input/blob/main/PRIVACY.md

## カテゴリ候補

ユーザー補助機能

## 必要な画像

- 128×128 PNGアイコン（準備済み）
- 1280×800または640×400のスクリーンショット（最低1枚）
- 任意: 440×280の小型プロモーション画像
