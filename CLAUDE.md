# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 概要

`statusline.js` は Claude Code のステータスラインを表示する Node.js スクリプト。GSD の `gsd-statusline.js` をベースに、セッション制限・週間制限の表示を追加した fork。

`~/.claude/settings.json` の `statusLine.command` で参照される。

## 表示内容（左から順）

| 要素 | 説明 |
|------|------|
| GSD update banner | GSD 更新があれば先頭に表示 |
| model | `data.model.display_name` |
| task | 進行中 Todo の `activeForm`（存在する場合のみ） |
| dirname | ワークスペースのディレクトリ名 |
| branch | worktree 使用時のみ `(branch-name)` をディレクトリ名の隣に表示（`data.worktree.branch`） |
| `ses:` | セッション制限（`data.rate_limits.five_hour`）。バー・使用率・リセット残り時間を表示 |
| `week:` | 週間利用制限（`data.rate_limits.seven_day`）。リセット残り時間は24時間以内のみ表示 |

## データフロー

Claude Code が JSON を stdin に渡す → スクリプトが解析して stdout に ANSI 文字列を出力。stdin が3秒で閉じない場合は自動終了（タイムアウトガード）。

コンテキスト使用率は `/tmp/claude-ctx-{session_id}.json` にブリッジファイルとして書き出す（PostToolUse フックとの連携用）。

`rate_limits.*.resets_at` はUNIXタイムスタンプ（秒）。

## カラールール

### レート制限バー（ses / week 共通）
`<50%` 緑 / `<75%` 黄 / `<90%` 橙 / `≥90%` 赤点滅

ラベル・バー・使用率・リセット時間が一体で色変化する。

## 上流との差分

`gsd-statusline.js`（`~/.claude/hooks/`）は編集しない。このリポジトリのスクリプトのみ変更する。
