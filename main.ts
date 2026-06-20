import {
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  App,
  getAllTags,
  CachedMetadata,
} from "obsidian";

type Side = "left" | "right";
type Lang = "en" | "de";

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
  resetName: string;
  resetDesc: string;
}

const STRINGS: Record<Lang, Strings> = {
  en: {
    rulesHeading: "Sidebar rules",
    info:
      "If the note has the property or the tag, the widths set here are " +
      "applied (empty field = don't set that side). The first matching rule " +
      "wins. The star marks the default rule used for resetting (see Behavior).",
    phProperty: "Property",
    phTag: "#tag",
    phLeft: "L px",
    phRight: "R px",
    starOn: "Default (click to clear)",
    starOff: "Set as default",
    removeRule: "Remove rule",
    addRule: "Add rule",
    behaviorHeading: "Behavior",
    resetName: "Reset to default when no rule matches",
    resetDesc:
      "Off: width stays unchanged when no rule matches. On: sets the width " +
      "of the rule marked with the star.",
  },
  de: {
    rulesHeading: "Seitenleisten-Regeln",
    info:
      "Trägt die Notiz die Eigenschaft oder den Tag, werden die hier " +
      "hinterlegten Breiten angewendet (leeres Feld = diese Seite nicht " +
      "setzen). Die erste passende Regel gewinnt. Der Stern markiert die " +
      "Standardregel für das Zurücksetzen (siehe Verhalten).",
    phProperty: "Eigenschaft",
    phTag: "#Tag",
    phLeft: "L px",
    phRight: "R px",
    starOn: "Standard (klicken zum Aufheben)",
    starOff: "Als Standard markieren",
    removeRule: "Regel entfernen",
    addRule: "Regel hinzufügen",
    behaviorHeading: "Verhalten",
    resetName: "Ohne Treffer auf Standard zurücksetzen",
    resetDesc:
      "Aus: Breite bleibt unverändert, wenn keine Regel greift. " +
      "An: setzt auf die Breite der mit Stern markierten Regel.",
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
  resetWhenAbsent: boolean;
}

function defaults(): CustomSidebarSettings {
  return {
    rules: [
      { property: "nav-width", tag: "", left: 250, right: null, isDefault: false },
    ],
    resetWhenAbsent: false,
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

  async onload() {
    await this.loadSettings();

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => this.applyWidths())
    );
    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        if (file === this.app.workspace.getActiveFile()) this.applyWidths();
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

    this.applySide("left", this.matchedWidth("left", fm, tagSet));
    this.applySide("right", this.matchedWidth("right", fm, tagSet));
  }

  private matches(
    r: Rule,
    fm: Record<string, unknown> | undefined,
    tagSet: Set<string>
  ): boolean {
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

  private applySide(side: Side, width: number | null) {
    if (width === null && this.settings.resetWhenAbsent) {
      width = this.starWidth(side);
    }
    if (width === null) return;
    this.setSidebarWidth(side, width);
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

    let reset = data.resetWhenAbsent === true;

    if (Array.isArray(data.rules)) {
      for (const r of data.rules as Array<Record<string, unknown>>) pushRule(r);
      if (out.some((r) => r.isDefault)) reset = true;
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

    this.settings = {
      rules: out.length ? out : defaults().rules,
      resetWhenAbsent: reset,
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
      .setName(s.resetName)
      .setDesc(s.resetDesc)
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.resetWhenAbsent)
          .onChange(async (v) => {
            this.plugin.settings.resetWhenAbsent = v;
            await this.save();
          })
      );
  }
}
