import {
  App,
  MarkdownView,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
} from "obsidian";
interface ObsidianAutomaticTimeBlockingSettings {
  plannerHeading: string;
  plannerHeadingLevel: number;
  dayStartTime: string;
  defaultDurationMinutes: number;
}
const DEFAULT_SETTINGS: ObsidianAutomaticTimeBlockingSettings = {
  plannerHeading: "Time Blocks",
  plannerHeadingLevel: 2,
  dayStartTime: "09:00",
  defaultDurationMinutes: 30,
};

interface LegacyObsidianAutomaticTimeBlockingSettings extends Partial<ObsidianAutomaticTimeBlockingSettings> {
  outputHeading?: string;
}

interface ParsedTask {
  text: string;
  durationMinutes: number;
}

export default class ObsidianAutomaticTimeBlocking extends Plugin {
  settings: ObsidianAutomaticTimeBlockingSettings;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "generate-time-blocks-from-active-note",
      name: "Generate time blocks from active note",
      checkCallback: (checking: boolean) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view || !view.file) {
          return false;
        }

        if (!checking) {
          void this.generateTimeBlocksForActiveNote();
        }

        return true;
      },
    });

    this.addRibbonIcon("calendar-clock", "Generate time blocks", () => {
      void this.generateTimeBlocksForActiveNote();
    });

    this.addSettingTab(new AutomaticTimeBlockingSettingTab(this.app, this));
  }

  onunload() {}

  async loadSettings() {
    const loadedData =
      (await this.loadData()) as LegacyObsidianAutomaticTimeBlockingSettings | null;

    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData ?? {});

    if (!this.settings.plannerHeading && loadedData?.outputHeading) {
      this.settings.plannerHeading = loadedData.outputHeading;
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  private async generateTimeBlocksForActiveNote() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.file) {
      new Notice("Open a Markdown note to generate time blocks.");
      return;
    }

    const content = await this.app.vault.cachedRead(view.file);
    const tasks = this.extractOpenTasks(content);

    if (tasks.length === 0) {
      new Notice("No open or in-progress tasks found in the active note.");
      return;
    }

    const generatedLines = this.buildTimeBlockLines(tasks);
    const updatedContent = this.upsertHeadingSection(
      content,
      this.settings.plannerHeading,
      this.settings.plannerHeadingLevel,
      generatedLines.join("\n"),
    );

    await this.app.vault.modify(view.file, updatedContent);

    new Notice(
      `Generated ${tasks.length} time block${tasks.length === 1 ? "" : "s"}.`,
    );
  }

  private extractOpenTasks(content: string): ParsedTask[] {
    const lines = content.split(/\r?\n/);
    const tasks: ParsedTask[] = [];

    for (const line of lines) {
      const taskMatch = line.match(/^\s*[-*]\s+\[( |\/|>)\]\s+(.*)$/);
      if (!taskMatch) {
        continue;
      }

      const rawText = taskMatch[2].trim();
      const durationMinutes = this.parseDurationMinutes(rawText);
      tasks.push({
        text: this.cleanTaskText(rawText),
        durationMinutes,
      });
    }

    return tasks;
  }

  private parseDurationMinutes(taskText: string): number {
    const markerMatch = taskText.match(/(?:\[(\d+)m\]|@(\d+)m)\b/i);
    const durationText = markerMatch?.[1] ?? markerMatch?.[2];
    const parsedDuration = durationText ? Number(durationText) : NaN;

    if (!Number.isFinite(parsedDuration) || parsedDuration <= 0) {
      return this.settings.defaultDurationMinutes;
    }

    return parsedDuration;
  }

  private cleanTaskText(taskText: string): string {
    return taskText
      .replace(/^\d{1,2}:\d{2}-\d{1,2}:\d{2}\s+/, "")
      .replace(/\[(\d+)m\]|@(\d+)m/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  private buildTimeBlockLines(tasks: ParsedTask[]): string[] {
    const lines: string[] = [];
    let currentMinutes = this.getInitialStartMinutes();

    for (const task of tasks) {
      const start = this.formatMinutesAsTime(currentMinutes);
      currentMinutes += task.durationMinutes;
      const end = this.formatMinutesAsTime(currentMinutes);
      lines.push(`- [ ] ${start}-${end} ${task.text}`);
    }

    return lines;
  }

  private getInitialStartMinutes(): number {
    const configuredStartMinutes = this.parseTimeToMinutes(
      this.settings.dayStartTime,
    );
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const snappedCurrentMinutes = Math.ceil(currentMinutes / 15) * 15;

    return Math.max(configuredStartMinutes, snappedCurrentMinutes);
  }

  private parseTimeToMinutes(value: string): number {
    const match = value.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) {
      return this.parseTimeToMinutes(DEFAULT_SETTINGS.dayStartTime);
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);

    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return this.parseTimeToMinutes(DEFAULT_SETTINGS.dayStartTime);
    }

    return hours * 60 + minutes;
  }

  private formatMinutesAsTime(totalMinutes: number): string {
    const normalizedMinutes = ((totalMinutes % 1440) + 1440) % 1440;
    const hours = Math.floor(normalizedMinutes / 60);
    const minutes = normalizedMinutes % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
  }

  private upsertHeadingSection(
    content: string,
    heading: string,
    headingLevel: number,
    sectionBody: string,
  ): string {
    const trimmedContent = content.replace(/\s+$/, "");
    const lines =
      trimmedContent.length > 0 ? trimmedContent.split(/\r?\n/) : [];
    const normalizedLevel = Math.min(Math.max(Math.floor(headingLevel), 1), 6);
    const headingLine = `${"#".repeat(normalizedLevel)} ${heading}`;
    const headingIndex = lines.findIndex((line) => line.trim() === headingLine);

    if (headingIndex === -1) {
      const prefix = trimmedContent.length > 0 ? `${trimmedContent}\n\n` : "";
      return `${prefix}${headingLine}\n${sectionBody}\n`;
    }

    let sectionEnd = lines.length;
    for (let index = headingIndex + 1; index < lines.length; index += 1) {
      if (/^#{1,6}\s+/.test(lines[index])) {
        sectionEnd = index;
        break;
      }
    }

    const updatedLines = [
      ...lines.slice(0, headingIndex + 1),
      sectionBody,
      ...lines.slice(sectionEnd),
    ];

    return `${updatedLines.join("\n")}\n`;
  }
}

class AutomaticTimeBlockingSettingTab extends PluginSettingTab {
  plugin: ObsidianAutomaticTimeBlocking;

  constructor(app: App, plugin: ObsidianAutomaticTimeBlocking) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    let { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Automatic Time Blocking" });

    new Setting(containerEl)
      .setName("Planner heading level")
      .setDesc(
        "Matches the Day Planner style of heading selection. Choose which Markdown heading level should contain generated time blocks, from H1 (#) through H6 (######).",
      )
      .addSlider((slider) =>
        slider
          .setLimits(1, 6, 1)
          .setValue(this.plugin.settings.plannerHeadingLevel)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.plannerHeadingLevel = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Planner heading text")
      .setDesc(
        `Matches Day Planner's heading title setting. Generated time blocks will be written under ${"#".repeat(this.plugin.settings.plannerHeadingLevel)} ${this.plugin.settings.plannerHeading}. If that heading already exists in the active note, its section is replaced. Otherwise, the heading is appended to the end of the note.`,
      )
      .addText((text) =>
        text
          .setPlaceholder("Time Blocks")
          .setValue(this.plugin.settings.plannerHeading)
          .onChange(async (value) => {
            this.plugin.settings.plannerHeading =
              value.trim() || DEFAULT_SETTINGS.plannerHeading;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Day start time")
      .setDesc(
        "Time used for the first generated block in HH:MM 24-hour format.",
      )
      .addText((text) =>
        text
          .setPlaceholder("09:00")
          .setValue(this.plugin.settings.dayStartTime)
          .onChange(async (value) => {
            this.plugin.settings.dayStartTime =
              value.trim() || DEFAULT_SETTINGS.dayStartTime;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Default duration")
      .setDesc(
        "Minutes to use when a task does not include a duration marker like [30m] or @30m.",
      )
      .addText((text) =>
        text
          .setPlaceholder("30")
          .setValue(String(this.plugin.settings.defaultDurationMinutes))
          .onChange(async (value) => {
            const parsedValue = Number(value);
            this.plugin.settings.defaultDurationMinutes =
              Number.isFinite(parsedValue) && parsedValue > 0
                ? parsedValue
                : DEFAULT_SETTINGS.defaultDurationMinutes;
            await this.plugin.saveSettings();
          }),
      );
  }
}
