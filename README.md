# Custom Sidebar Width

Set the width of the left and right sidebars **per note**, based on a note's
frontmatter properties or tags. Useful when some notes need a wide file
explorer or a roomy right sidebar while others should stay compact.

## How it works

You define **rules** in the plugin settings. Each rule has:

- a **property** name and/or a **tag** — the trigger that makes the rule match,
- a **left** and/or **right** width in pixels — leave a side empty to not touch
  it.

When you open a note, the plugin checks it against your rules **from top to
bottom** and applies the **first one that matches**.

### What makes a rule match?

A rule matches a note when **either** is true:

- the note's frontmatter **contains the property key**, or
- the note **carries the tag**.

> [!IMPORTANT]
> For a property, only the **key has to exist** — its **value is irrelevant**.
> `home_sidebars: (empty)`, `home_sidebars: false` or `home_sidebars: anything`
> all match equally. You do **not** need to set it to `true`.

### Example

In the plugin settings, add a rule: property `home_sidebars`, left `400`, right
empty. Then add that key to any note's frontmatter — no value needed:

```markdown
---
home_sidebars:
---
```

Opening that note widens the left sidebar to 400 px. Notes without the key keep
whatever width they had.

Prefer tags? Use a rule with a **tag** instead — e.g. `#wide` applies to every
note carrying that tag.

## Behavior when no rule matches

The **When no rule matches** setting controls what happens on notes that don't
match any rule:

- **Restore previous width** (default) — remembers the sidebar width from
  *before* a rule was applied and puts it back when you leave a matched note.
- **Reset to default width** — snaps back to the width of the rule you marked
  with the star button. (The star *only* designates this fallback width — it has
  no other effect.)
- **Leave width unchanged** — the sidebar keeps whatever width it has.

## Installation

### From the Community Plugins browser

1. Open **Settings → Community plugins**.
2. Disable Restricted mode if needed.
3. Click **Browse**, search for **Custom Sidebar Width**, and install.
4. Enable the plugin.

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest
   [release](../../releases).
2. Copy them into `<your vault>/.obsidian/plugins/custom-sidebar-width/`.
3. Reload Obsidian and enable the plugin under **Community plugins**.

## Notes

This plugin is desktop-only, because mobile sidebars behave as overlays rather
than fixed-width panes.

## Development

```bash
npm install
npm run dev    # watch build
npm run build  # production build + type check
```

## License

[MIT](LICENSE)
