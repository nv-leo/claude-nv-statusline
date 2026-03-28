# claude-nv-statusline

Claude Code のステータスラインスクリプト。[GSD](https://github.com/gsd-build/get-shit-done) の `gsd-statusline.js` をベースに、セッション・週間レート制限の表示を追加した fork。

> Based on [get-shit-done](https://github.com/gsd-build/get-shit-done) by Lex Christopherson, licensed under MIT.

## 表示例

```
Sonnet 4.6 │ claude-nv-statusline │ ses: █████░░░░░ 49% ⏳2h30m  week: █░░░░░░░░░ 6%
```

worktree 使用時:
```
Sonnet 4.6 │ claude-nv-statusline (feat/auth) │ ses: █████░░░░░ 49% ⏳2h30m  week: █░░░░░░░░░ 6%
```

## セットアップ

`~/.claude/settings.json` に以下を追加:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node \"/path/to/claude-nv-statusline/statusline.js\""
  }
}
```

## 表示内容

| 要素 | 説明 |
|------|------|
| model | モデル名 |
| task | 進行中タスク（存在する場合のみ） |
| dirname | 作業ディレクトリ名 |
| branch | worktree 使用時のブランチ名 |
| `ses:` | セッション制限（5時間）。バー + 使用率 + リセット残り時間 |
| `week:` | 週間制限。リセット残り時間は24時間以内のみ表示 |

## カラールール

`<50%` 緑 / `<75%` 黄 / `<90%` 橙 / `≥90%` 赤点滅
