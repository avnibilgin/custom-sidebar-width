import {
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  App,
  getAllTags,
  debounce,
  CachedMetadata,
} from "obsidian";

type Side = "left" | "right";
type Lang = "en" | "de";
type WhenAbsent = "leave" | "default" | "previous";

interface Strings {
  rulesHeading: string;
  info: string;
  phProperty: string;
  phTag: string;
  phLeft: string;
  phRight: string;
  starOn: string;
  starOff: string;
  removeRule: string;
  addRule: string;
  behaviorHeading: string;
  whenAbsentName: string;
  whenAbsentDesc: string;
  optLeave: string;
  optDefault: string;
  optPrevious: string;
}

const STRINGS: Record<Lang, Strings> = {
  en: {
    rulesHeading: "Sidebar rules",
    info:
      "A rule applies as soon as the open note has the given property or tag. " +
      "For the property it is enough that the key exists in the frontmatter — " +
      "the value does not matter (`home_sidebars:` empty, `home_sidebars: " +
      "false` or any value all match). If several rules match, the topmost one " +
      "wins. An empty width field (L/R) leaves that side unchanged. The star " +
      "only matters for the “Reset to default width” option below — it sets " +
      "which rule's width is used as the fallback there, nothing else.",
    phProperty: "Property",
    phTag: "#tag",
    phLeft: "L px",
    phRight: "R px",
    starOn: "Fallback width for “Reset to default width” (click to clear)",
    starOff: "Use this rule's width as the fallback for “Reset to default width”",
    removeRule: "Remove rule",
    addRule: "Add rule",
    behaviorHeading: "Behavior",
    whenAbsentName: "When no rule matches",
    whenAbsentDesc:
      "What happens to the sidebar width on notes that match no rule. " +
      "“Restore previous width” (default) remembers the width from before a " +
      "rule and puts it back when you leave a matched note. “Reset to default " +
      "width” uses the width you starred above. “Leave width unchanged” does " +
      "nothing.",
    optLeave: "Leave width unchanged",
    optDefault: "Reset to default width (star)",
    optPrevious: "Restore previous width",
  },
  de: {
    rulesHeading: "Seitenleisten-Regeln",
    info:
      "Eine Regel greift, sobald die geöffnete Notiz die eingetragene " +
      "Eigenschaft oder den Tag hat. Bei der Eigenschaft genügt, dass der " +
      "Schlüssel im Frontmatter steht — der Wert spielt keine Rolle " +
      "(`home_sidebars:` leer, `home_sidebars: false` oder ein beliebiger " +
      "Wert greifen alle gleich). Passen mehrere Regeln, gewinnt die oberste. " +
      "Ein leeres Breitenfeld (L/R) lässt diese Seite unverändert. Der Stern " +
      "ist nur für die Option „Auf Standardbreite zurücksetzen“ weiter unten " +
      "wichtig — er legt fest, welche Regel-Breite dort als Rückfall dient, " +
      "sonst nichts.",
    phProperty: "Eigenschaft",
    phTag: "#Tag",
    phLeft: "L px",
    phRight: "R px",
    starOn: "Rückfall-Breite für „Auf Standardbreite zurücksetzen“ (klicken zum Aufheben)",
    starOff: "Diese Regel als Rückfall-Breite für „Auf Standardbreite zurücksetzen“ festlegen",
    removeRule: "Regel entfernen",
    addRule: "Regel hinzufügen",
    behaviorHeading: "Verhalten",
    whenAbsentName: "Wenn keine Regel passt",
    whenAbsentDesc:
      "Was mit der Seitenleisten-Breite geschieht, wenn die Notiz keine Regel " +
      "trifft. „Vorherige Breite wiederherstellen“ (Standard) merkt sich die " +
      "Breite von vor der Regel und stellt sie beim Verlassen einer Regel-" +
      "Notiz wieder her. „Auf Standardbreite zurücksetzen“ nutzt die oben mit " +
      "dem Stern markierte Breite. „Breite unverändert lassen“ tut nichts.",
    optLeave: "Breite unverändert lassen",
    optDefault: "Auf Standardbreite zurücksetzen (Stern)",
    optPrevious: "Vorherige Breite wiederherstellen",
  },
};

function getStrings(): Strings {
  // Obsidian's getLanguage() would be cleaner but requires a newer minAppVersion
  // than 1.4.0; read the stored UI language directly to keep broad compatibility.
  const l = window.localStorage.getItem("language");
  return l === "de" ? STRINGS.de : STRINGS.en;
}

interface Rule {
  property: string;
  tag: string;
  left: number | null;
  right: number | null;
  isDefault: boolean;
}

interface CustomSidebarSettings {
  rules: Rule[];
  whenAbsent: WhenAbsent;
}

function defaults(): CustomSidebarSettings {
  return {
    rules: [
      { property: "home_sidebars", tag: "", left: 250, right: null, isDefault: false },
    ],
    whenAbsent: "previous",
  };
}

function parseWidth(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#/, "").toLowerCase();
}

export default class CustomSidebarWidth extends Plugin {
  settings!: CustomSidebarSettings;

  // Runtime state for "restore previous width": the width captured right before a
  // rule first overrode a side, and whether a rule is currently applied there.
  private prev: Record<Side, number | null> = { left: null, right: null };
  private active: Record<Side, boolean> = { left: false, right: false };

  // Debounced apply: let Obsidian finish the leaf/layout switch first, so we read
  // the settled active note and don't fight the navigation (fixes the snap-back).
  private apply = debounce(() => this.applyWidths(), 50, true);

  async onload() {
    await this.loadSettings();

    // Use "file-open" (fires only when a note actually opens) rather than
    // "active-leaf-change" (also fires on sidebar clicks). Reacting to the latter
    // resized the sidebar mid-click in the file explorer and broke navigation.
    this.registerEvent(
      this.app.workspace.on("file-open", () => this.apply())
    );
    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        if (file === this.app.workspace.getActiveFile()) this.apply();
      })
    );

    this.addSettingTab(new CustomSidebarSettingTab(this.app, this));
    this.app.workspace.onLayoutReady(() => this.applyWidths());
  }

  applyWidths() {
    const file = this.app.workspace.getActiveFile();
    const cache: CachedMetadata | null =
      file instanceof TFile ? this.app.metadataCache.getFileCache(file) : null;
    const fm = cache?.frontmatter as Record<string, unknown> | undefined;
    const tagSet = new Set(
      cache ? (getAllTags(cache) ?? []).map(normalizeTag) : []
    );

    this.handleSide("left", this.matchedWidth("left", fm, tagSet));
    this.handleSide("right", this.matchedWidth("right", fm, tagSet));
  }

  private matches(
    r: Rule,
    fm: Record<string, unknown> | undefined,
    tagSet: Set<string>
  ): boolean {
    // Property match is presence-based: the key just has to exist in the
    // frontmatter — its value is irrelevant (empty, false or anything matches).
    const prop = r.property.trim();
    if (prop && fm && prop in fm) return true;
    const t = normalizeTag(r.tag);
    return !!t && tagSet.has(t);
  }

  private matchedWidth(
    side: Side,
    fm: Record<string, unknown> | undefined,
    tagSet: Set<string>
  ): number | null {
    for (const r of this.settings.rules) {
      if (this.matches(r, fm, tagSet)) {
        const v = side === "left" ? r.left : r.right;
        if (v !== null) return v;
      }
    }
    return null;
  }

  private starWidth(side: Side): number | null {
    for (const r of this.settings.rules) {
      if (r.isDefault) {
        const v = side === "left" ? r.left : r.right;
        if (v !== null) return v;
      }
    }
    return null;
  }

  private handleSide(side: Side, matched: number | null) {
    if (matched !== null) {
      // A rule applies on this side.
      if (!this.active[side]) {
        // Entering a rule from a non-rule state → remember the current width.
        this.prev[side] = this.currentWidth(side);
        this.active[side] = true;
      }
      this.setSidebarWidth(side, matched);
      return;
    }

    // No rule on this side.
    if (this.active[side]) {
      // We just left a matched note → act per the "when no rule matches" mode.
      this.active[side] = false;
      const mode = this.settings.whenAbsent;
      if (mode === "previous") {
        if (this.prev[side] !== null) this.setSidebarWidth(side, this.prev[side]!);
      } else if (mode === "default") {
        const w = this.starWidth(side);
        if (w !== null) this.setSidebarWidth(side, w);
      }
      this.prev[side] = null;
      return;
    }

    // Still on non-rule notes: only "default" keeps snapping to the star width.
    if (this.settings.whenAbsent === "default") {
      const w = this.starWidth(side);
      if (w !== null) this.setSidebarWidth(side, w);
    }
  }

  // Current pixel width of a sidebar dock; null if collapsed or unreadable, so we
  // never remember a bogus (≈0) width to restore later.
  private currentWidth(side: Side): number | null {
    const split = (
      side === "left"
        ? this.app.workspace.leftSplit
        : this.app.workspace.rightSplit
    ) as unknown as { collapsed?: boolean };
    if (split?.collapsed) return null;
    const selector =
      side === "left"
        ? ".workspace-split.mod-left-split"
        : ".workspace-split.mod-right-split";
    const el = activeDocument.querySelector<HTMLElement>(selector);
    if (!el) return null;
    const w = Math.round(el.getBoundingClientRect().width);
    return w > 20 ? w : null;
  }

  private setSidebarWidth(side: Side, width: number) {
    // Obsidian does not expose a public API for the sidebar width. The split
    // objects carry an (undocumented) setSize method that resizes the dock;
    // we feature-detect it and fall back to writing the width on the element.
    const split = (
      side === "left"
        ? this.app.workspace.leftSplit
        : this.app.workspace.rightSplit
    ) as unknown as { setSize?: (size: number) => void };

    if (typeof split?.setSize === "function") {
      split.setSize(width);
      return;
    }

    const selector =
      side === "left"
        ? ".workspace-split.mod-left-split"
        : ".workspace-split.mod-right-split";
    const el = activeDocument.querySelector<HTMLElement>(selector);
    if (el) el.style.width = `${width}px`;
  }

  async loadSettings() {
    const data = ((await this.loadData()) ?? {}) as Record<string, unknown>;
    const out: Rule[] = [];

    const pushRule = (r: Record<string, unknown>) =>
      out.push({
        property: typeof r.property === "string" ? r.property : "",
        tag: typeof r.tag === "string" ? r.tag : "",
        left: typeof r.left === "number" ? r.left : null,
        right: typeof r.right === "number" ? r.right : null,
        isDefault: r.isDefault === true,
      });

    if (Array.isArray(data.rules)) {
      for (const r of data.rules as Array<Record<string, unknown>>) pushRule(r);
    } else {
      const left = data.left as Record<string, unknown> | undefined;
      const right = data.right as Record<string, unknown> | undefined;
      if (left || right) {
        pushRule({
          property: typeof left?.property === "string" ? left.property : "nav-width",
          tag: typeof left?.tag === "string" ? left.tag : "",
          left: typeof left?.default === "number" ? left.default : 250,
        });
        pushRule({
          property:
            typeof right?.property === "string" ? right.property : "nav-width-right",
          tag: typeof right?.tag === "string" ? right.tag : "",
          right: typeof right?.default === "number" ? right.default : 300,
        });
      }
      if (Array.isArray(data.tagRules)) {
        for (const r of data.tagRules as Array<Record<string, unknown>>) pushRule(r);
      }
    }

    // At most one default rule (star).
    let seen = false;
    for (const r of out) {
      if (r.isDefault && !seen) seen = true;
      else r.isDefault = false;
    }

    // "When no rule matches" mode. New default is "previous"; migrate the old
    // resetWhenAbsent boolean (true → "default").
    let whenAbsent: WhenAbsent;
    if (
      data.whenAbsent === "leave" ||
      data.whenAbsent === "default" ||
      data.whenAbsent === "previous"
    ) {
      whenAbsent = data.whenAbsent;
    } else {
      whenAbsent = data.resetWhenAbsent === true ? "default" : "previous";
    }

    this.settings = {
      rules: out.length ? out : defaults().rules,
      whenAbsent,
    };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class CustomSidebarSettingTab extends PluginSettingTab {
  plugin: CustomSidebarWidth;

  constructor(app: App, plugin: CustomSidebarWidth) {
    super(app, plugin);
    this.plugin = plugin;
  }

  private save() {
    return this.plugin.saveSettings();
  }

  private numField(
    setting: Setting,
    placeholder: string,
    get: () => number | null,
    set: (n: number | null) => void
  ) {
    setting.addText((t) => {
      const current = get();
      t.setPlaceholder(placeholder)
        .setValue(current != null ? String(current) : "")
        .onChange(async (v) => {
          if (v.trim() === "") set(null);
          else {
            const n = parseWidth(v);
            if (n !== null) set(n);
          }
          await this.save();
        });
      t.inputEl.addClass("csw-num");
    });
  }

  display() {
    const { containerEl } = this;
    const s = getStrings();
    containerEl.empty();

    new Setting(containerEl).setName(s.rulesHeading).setHeading();
    containerEl.createEl("p", { text: s.info, cls: "csw-info" });

    this.plugin.settings.rules.forEach((rule, idx) => {
      const row = new Setting(containerEl);
      row.settingEl.addClass("csw-rule-row");

      row.addText((t) => {
        t.setPlaceholder(s.phProperty)
          .setValue(rule.property)
          .onChange(async (v) => {
            rule.property = v.trim();
            await this.save();
          });
        t.inputEl.addClass("csw-grow");
      });
      row.addText((t) => {
        t.setPlaceholder(s.phTag)
          .setValue(rule.tag)
          .onChange(async (v) => {
            rule.tag = v.trim();
            await this.save();
          });
        t.inputEl.addClass("csw-grow");
      });

      this.numField(row, s.phLeft, () => rule.left, (n) => (rule.left = n));
      this.numField(row, s.phRight, () => rule.right, (n) => (rule.right = n));

      row.addExtraButton((b) => {
        b.setIcon("star")
          .setTooltip(rule.isDefault ? s.starOn : s.starOff)
          .onClick(async () => {
            const turnOn = !rule.isDefault;
            this.plugin.settings.rules.forEach((r) => (r.isDefault = false));
            rule.isDefault = turnOn;
            await this.save();
            this.display();
          });
        b.extraSettingsEl.toggleClass("csw-default-active", rule.isDefault);
      });

      row.addExtraButton((b) =>
        b
          .setIcon("trash")
          .setTooltip(s.removeRule)
          .onClick(async () => {
            this.plugin.settings.rules.splice(idx, 1);
            await this.save();
            this.display();
          })
      );
    });

    new Setting(containerEl).addButton((b) =>
      b
        .setButtonText(s.addRule)
        .setCta()
        .onClick(async () => {
          this.plugin.settings.rules.push({
            property: "",
            tag: "",
            left: null,
            right: null,
            isDefault: false,
          });
          await this.save();
          this.display();
        })
    );

    new Setting(containerEl).setName(s.behaviorHeading).setHeading();
    new Setting(containerEl)
      .setName(s.whenAbsentName)
      .setDesc(s.whenAbsentDesc)
      .addDropdown((d) =>
        d
          .addOption("previous", s.optPrevious)
          .addOption("default", s.optDefault)
          .addOption("leave", s.optLeave)
          .setValue(this.plugin.settings.whenAbsent)
          .onChange(async (v) => {
            this.plugin.settings.whenAbsent = v as WhenAbsent;
            await this.save();
          })
      );
  }
}
