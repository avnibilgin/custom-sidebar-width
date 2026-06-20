# Custom Sidebar Width

Set the width of the left and right sidebars **per note**, based on a note's
frontmatter properties or tags. Useful when some notes need a wide file
explorer or a roomy right sidebar while others should stay compact.

## How it works

You define a list of **rules** in the plugin settings. Each rule has:

- a **property** name and/or a **tag**,
- a **left** width in pixels (optional),
- a **right** width in pixels (optional).

When you open a note, the plugin looks at the note's frontmatter and tags and
applies the **first matching rule**. A rule matches when the note has the named
frontmatter property (any value, even empty) *or* the given tag. An empty width
field means "leave that side unchanged".

### Example

Add a rule with property `home_sidebars`, left `400`, and right empty. Then in a
note's frontmatter just add the key — **no value is needed**:

```markdown
---
home_sidebars:
---
```

Opening that note widens the left sidebar to 400 px. The property matches purely
by the **presence** of the key: `home_sidebars:` (empty), `home_sidebars: false`
or any value all trigger the rule. Notes without the property keep whatever width
they had.

You can also match on tags, e.g. a rule with tag `#wide` applies to every note
carrying that tag.

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
