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
frontmatter property *or* the given tag. An empty width field means "leave that
side unchanged".

### Example

Add a rule with property `nav-width`, left `400`, and right empty. Then in a
note:

```markdown
---
nav-width: true
---
```

Opening that note widens the left sidebar to 400 px. Notes without the property
keep whatever width they had.

You can also match on tags, e.g. a rule with tag `#wide` applies to every note
carrying that tag.

## Behavior when no rule matches

By default the sidebar width is left unchanged when no rule matches. You can
mark one rule as the **default** (the star button) and enable
**"Reset to default when no rule matches"** to snap the sidebar back to that
width on notes that don't match any rule.

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
