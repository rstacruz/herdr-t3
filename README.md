# Herdr T3

A private fork of [herdr-t3](https://github.com/JinJieBeWater/herdr-t3), a T3 Code-like layout for [Herdr App](https://herdr.dev).

Install or update into `~/.config/herdr-app`:

```sh
scripts/update.sh
```

## Additional features

### Early settle

Right-click an Inbox card for its menu:

- **Settle** works while the agent is still working. It stays settled through that run and the turn it ends, unless it needs you; the turn after brings it back.
- **Mark unread** puts an idle agent back to Done, and brings it back if it was settled.
- The space's own items (Rename space, Labels…, worktrees, Close space) follow.

### Labels

Give spaces labels, and filter by them.

- **Labels…** in a space's menu (or an Inbox card's) opens the `t3-labels` dialog. Click a label to toggle it; type a new one and press Enter to add it.
- The Spaces list heading has a label filter. Click a label to show only its spaces; shift-click to pick several.
- The Inbox's space filter lists labels too. Spaces and labels add up: a card shows when its space is picked or has a picked label.
- Labels are stored per machine in `~/.config/herdr-space-labels.json`, so every screen showing that machine's spaces sees the same ones.

### UI cleanup

- The Inbox's top-row buttons (filter, New space, New tab) show only on hover, while the keyboard is on one of them, while the filter's menu is open, or while a filter is set.
- No divider beside the sidebar.

## Credits and license

Based on [herdr-t3](https://github.com/JinJieBeWater/herdr-t3) by [JinJieBeWater](https://github.com/JinJieBeWater), licensed under the [Apache License 2.0](LICENSE). This fork keeps that license; its changes are listed above and in the git history.
