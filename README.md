# SnapWidget CLI

Ask your AI agent to add your Instagram feed or your Google reviews to your website. The SnapWidget CLI for Claude Code, Codex, Cursor and other agents.

## Get started

You need Node.js 18 or later.

```
npm install -g snapwidget
snapwidget login                     # an existing account: sign in in the browser
snapwidget signup --email you@example.com
snapwidget verify --email you@example.com --code 123456
snapwidget widgets list
snapwidget embed <widget_id> --format next
snapwidget --help
```

Every command prints JSON, and `snapwidget <command> --help` shows its options. The CLI keeps the sign-in in `~/.config/snapwidget/config.json`. `SNAPWIDGET_TOKEN` sends a token in place of the saved sign-in.

The skill and the plugin files are in [snapwidget/snapwidget-agent](https://github.com/snapwidget/snapwidget-agent).

## Help

[SnapWidget docs](https://snapwidget.com/docs) · [AI agents](https://snapwidget.com/docs/ai-agents) · [Issues](https://github.com/snapwidget/snapwidget-cli/issues)
