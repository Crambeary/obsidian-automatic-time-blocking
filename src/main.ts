import {
  App,
  FuzzySuggestModal,
  MarkdownView,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  requestUrl,
  Setting,
  TFile,
  TFolder,
} from "obsidian";

type TaskPriority = "highest" | "high" | "medium" | "none" | "low" | "lowest";

interface DataviewPageFile {
  path?: string;
}

interface DataviewPage {
  file?: DataviewPageFile;
}

interface DataviewApi {
  pages: (source?: string) => unknown;
}

interface DataviewArrayLike<T> {
  array?: () => T[];
  values?: T[] | { array?: () => T[] };
  [Symbol.iterator]?: () => Iterator<T>;
}

interface ExternalTaskDiscoveryResult {
  files: TFile[];
  usedDataviewIndex: boolean;
}

interface TimeRange {
  startMinutes: number;
  endMinutes: number;
}

interface CalendarBusyRange extends TimeRange {
  summary: string;
  uid: string;
}

interface ParsedIcsEvent {
  uid: string;
  summary: string;
  start: Date;
  end: Date;
  recurrenceRule: string | null;
  recurrenceId: Date | null;
  exceptionDates: Date[];
}

interface CalendarPreviewData {
  matchedEvents: CalendarBusyRange[];
  busyRanges: CalendarBusyRange[];
  failedCalendarCount: number;
  loadedCalendarCount: number;
  planningDate: Date;
  eventDiagnostics: CalendarEventDiagnostic[];
}

interface CalendarEventDiagnostic {
  summary: string;
  uid: string;
  startText: string;
  endText: string;
  recurrenceRule: string | null;
  included: boolean;
  reason: string;
}

type AutomaticStartMode = "snapped" | "now";
type ExternalTaskDiscoveryMode = "built-in" | "dataview";

const TASK_PRIORITY_RANKS: Record<TaskPriority, number> = {
  highest: 6,
  high: 5,
  medium: 4,
  none: 3,
  low: 2,
  lowest: 1,
};

interface ObsidianAutomaticTimeBlockingSettings {
  plannerHeading: string;
  plannerHeadingLevel: number;
  dayStartTime: string;
  workDayEndTime: string;
  defaultDurationMinutes: number;
  startIntervalMinutes: number;
  automaticStartMode: AutomaticStartMode;
  splitTasksAcrossGaps: boolean;
  breakDurationMinutes: number;
  meetingBufferBeforeMinutes: number;
  meetingBufferAfterMinutes: number;
  remoteCalendarUrls: string[];
  ignoredCalendarEventPatterns: string;
  externalTaskDiscoveryMode: ExternalTaskDiscoveryMode;
  externalTaskNotePaths: string[];
  externalTaskFolderPaths: string[];
}

const DEFAULT_SETTINGS: ObsidianAutomaticTimeBlockingSettings = {
  plannerHeading: "Time Blocks",
  plannerHeadingLevel: 2,
  dayStartTime: "09:00",
  workDayEndTime: "17:00",
  defaultDurationMinutes: 30,
  startIntervalMinutes: 15,
  automaticStartMode: "snapped",
  splitTasksAcrossGaps: false,
  breakDurationMinutes: 0,
  meetingBufferBeforeMinutes: 0,
  meetingBufferAfterMinutes: 0,
  remoteCalendarUrls: [],
  ignoredCalendarEventPatterns: "",
  externalTaskDiscoveryMode: "built-in",
  externalTaskNotePaths: [],
  externalTaskFolderPaths: [],
};

interface LegacyObsidianAutomaticTimeBlockingSettings extends Partial<ObsidianAutomaticTimeBlockingSettings> {
  calendarIcsUrls?: string;
  outputHeading?: string;
}

interface ParsedTask {
  text: string;
  durationMinutes: number;
  priority: TaskPriority;
  manualStartMinutes: number | null;
  statusMarker: " ";
  indent: number;
  sourcePath: string;
  sourceLineNumber: number;
  isExternalSource: boolean;
  subtasks: ParsedTask[];
}

interface TaskCollectionResult {
  tasks: ParsedTask[];
  externalSourceFileCount: number;
  usedDataviewIndex: boolean;
}

interface DataviewDiscoveryDiagnostics {
  dataviewAvailable: boolean;
  indexedPageCount: number;
  scopedIndexedPageCount: number;
  resolvedMarkdownFileCount: number;
  matchingExternalTaskCount: number;
  scopedPagePaths: string[];
  resolvedMarkdownPaths: string[];
  matchingTaskSummaries: string[];
}

interface ParsedTaskTimeRange {
  startMinutes: number;
  endMinutes: number;
  durationMinutes: number;
}

const DEBUG_LOG_FILE_PATH = "Obsidian Automatic Time Blocking Debug Log.md";

interface GeneratedTimeBlocks {
  scheduledLines: string[];
  unscheduledLines: string[];
  scheduledTaskCount: number;
  skippedTaskCount: number;
}

interface ScheduledTaskSegment {
  startMinutes: number;
  endMinutes: number;
}

type ExternalSourceSelection = TFile | TFolder;

export default class ObsidianAutomaticTimeBlocking extends Plugin {
  settings: ObsidianAutomaticTimeBlockingSettings;
  calendarPreviewCache = new Map<string, CalendarPreviewData>();
  debugLogEntries: string[] = [];
  startupStatus = "Not started";
  debugLogWritePromise: Promise<void> = Promise.resolve();
  momentRuntime: {
    moment: (value?: Date) => {
      utcOffset: () => number;
      clone: () => {
        subtract: (amount: number, unit: string) => { toDate: () => Date };
      };
      isSame: (other: Date, unit: string) => boolean;
      add: (amount: number, unit: string) => { toDate: () => Date };
      toDate: () => Date;
    };
    tz: {
      guess: () => string;
      zone: (tzid: string) => {
        utcOffset: (timestamp: number) => number;
      } | null;
    };
  } | null = null;

  async onload() {
    try {
      this.startupStatus = "Loading settings";
      this.appendDebugLog("Startup: loading settings");
      await this.loadSettings();

      this.startupStatus = "Registering generate command";
      this.appendDebugLog("Startup: registering generate command");
      this.addCommand({
        id: "generate-time-blocks-from-active-note",
        name: "Generate time blocks for active note",
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

      this.startupStatus = "Registering ribbon";
      this.appendDebugLog("Startup: registering ribbon icon");
      this.addRibbonIcon("calendar-clock", "Generate time blocks", () => {
        void this.generateTimeBlocksForActiveNote();
      });

      this.startupStatus = "Registering calendar commands";
      this.appendDebugLog("Startup: registering calendar commands");
      this.addCommand({
        id: "refresh-busy-calendars",
        name: "Refresh busy calendars",
        callback: () => {
          void this.refreshBusyCalendarsForActiveNote();
        },
      });

      this.addCommand({
        id: "preview-busy-calendars-for-active-note",
        name: "Preview busy calendars for active note",
        checkCallback: (checking: boolean) => {
          const view = this.app.workspace.getActiveViewOfType(MarkdownView);
          if (!view || !view.file) {
            return false;
          }

          if (!checking) {
            void this.previewBusyCalendarsForActiveNote();
          }

          return true;
        },
      });

      this.addCommand({
        id: "debug-dataview-discovery-for-active-note",
        name: "Debug Dataview discovery for active note",
        checkCallback: (checking: boolean) => {
          const view = this.app.workspace.getActiveViewOfType(MarkdownView);
          if (!view || !view.file) {
            return false;
          }

          if (!checking) {
            void this.debugDataviewDiscoveryForActiveNote();
          }

          return true;
        },
      });

      this.addCommand({
        id: "open-debug-log",
        name: "Open debug log",
        callback: () => {
          this.openDebugLog();
        },
      });

      this.startupStatus = "Registering settings tab";
      this.appendDebugLog("Startup: registering settings tab");
      this.addSettingTab(new AutomaticTimeBlockingSettingTab(this.app, this));

      this.startupStatus = "Ready";
      this.appendDebugLog("Startup: plugin ready");
    } catch (error) {
      this.startupStatus = `Failed: ${this.formatErrorForDebug(error)}`;
      this.appendDebugLog(`Startup failed: ${this.formatErrorForDebug(error)}`);
      new Notice(
        `Automatic Time Blocking failed to start: ${this.formatErrorForDebug(error)}`,
      );
      throw error;
    }
  }

  onunload() {}

  async loadSettings() {
    const loadedData =
      (await this.loadData()) as LegacyObsidianAutomaticTimeBlockingSettings | null;

    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData ?? {});

    if (!Array.isArray(this.settings.remoteCalendarUrls)) {
      this.settings.remoteCalendarUrls = [];
    }

    if (
      this.settings.remoteCalendarUrls.length === 0 &&
      typeof loadedData?.calendarIcsUrls === "string"
    ) {
      this.settings.remoteCalendarUrls = loadedData.calendarIcsUrls
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    }

    if (!this.settings.plannerHeading && loadedData?.outputHeading) {
      this.settings.plannerHeading = loadedData.outputHeading;
    }
  }

  async saveSettings() {
    this.calendarPreviewCache.clear();
    await this.saveData(this.settings);
  }

  async refreshBusyCalendarsForActiveNote(): Promise<void> {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    const planningDate = activeView?.file
      ? this.resolvePlanningDate(activeView.file.basename)
      : this.getTodayDate();
    const previewData = await this.getCalendarPreviewData(planningDate, true);

    const loadedCount = previewData.loadedCalendarCount;
    const failedCount = previewData.failedCalendarCount;
    const eventCount = previewData.busyRanges.length;

    new Notice(
      `Refreshed ${loadedCount} remote calendar${loadedCount === 1 ? "" : "s"}; found ${eventCount} busy event${eventCount === 1 ? "" : "s"}.${failedCount > 0 ? ` ${failedCount} calendar${failedCount === 1 ? "" : "s"} failed to load.` : ""}`,
    );
  }

  async previewBusyCalendarsForActiveNote(): Promise<void> {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView || !activeView.file) {
      new Notice("Open a Markdown note to preview busy calendars.");
      return;
    }

    const planningDate = this.resolvePlanningDate(activeView.file.basename);
    const previewData = await this.getCalendarPreviewData(planningDate, false);
    new CalendarPreviewModal(this.app, previewData).open();
  }

  async debugDataviewDiscoveryForActiveNote(): Promise<void> {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView || !activeView.file) {
      new Notice("Open a Markdown note to debug Dataview discovery.");
      return;
    }

    const planningDate = this.resolvePlanningDate(activeView.file.basename);
    const diagnostics = await this.getDataviewDiscoveryDiagnostics(
      activeView.file,
      planningDate,
    );

    const debugText = this.formatDataviewDiagnostics(diagnostics);
    this.appendDebugLog(
      `Dataview discovery diagnostics for ${planningDate.toLocaleDateString()}\n${debugText}`,
    );
    console.log("[obsidian-atb] Dataview discovery diagnostics\n" + debugText);
    new DataviewDiagnosticsModal(this.app, planningDate, debugText).open();
  }

  openDebugLog(): void {
    new DebugLogModal(this.app, this.getDebugLogText()).open();
  }

  clearDebugLog(): void {
    this.debugLogEntries = [];
    this.queueDebugLogWrite();
  }

  private formatErrorForDebug(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }

  private async generateTimeBlocksForActiveNote() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.file) {
      new Notice("Open a Markdown note to generate time blocks.");
      return;
    }

    const content = await this.app.vault.cachedRead(view.file);
    const planningDate = this.resolvePlanningDate(view.file.basename);
    const taskCollection = await this.collectTasksForPlanningNote(
      view.file,
      content,
      planningDate,
    );
    const tasks = taskCollection.tasks;

    if (tasks.length === 0) {
      new Notice(
        "No open tasks matched the active note or configured external source notes for this planning date.",
      );
      return;
    }

    const { busyRanges, failedCalendarCount } =
      await this.getCalendarPreviewData(planningDate, false);
    const generatedTimeBlocks = this.buildTimeBlockLines(
      tasks,
      busyRanges,
      planningDate,
    );

    if (generatedTimeBlocks.scheduledLines.length === 0) {
      new Notice(
        "No time blocks fit inside the configured work day. Adjust your work day or task durations.",
      );
      return;
    }

    const sectionBody = this.buildPlannerSectionBody(generatedTimeBlocks);

    const updatedContent = this.upsertHeadingSection(
      content,
      this.settings.plannerHeading,
      this.settings.plannerHeadingLevel,
      sectionBody,
    );

    await this.app.vault.modify(view.file, updatedContent);

    const generatedCount = generatedTimeBlocks.scheduledTaskCount;
    const skippedCount = generatedTimeBlocks.skippedTaskCount;
    const skippedSuffix =
      skippedCount > 0
        ? ` Skipped ${skippedCount} task${skippedCount === 1 ? "" : "s"} that would exceed the configured work day.`
        : "";
    const calendarSuffix =
      failedCalendarCount > 0
        ? ` ${failedCalendarCount} calendar feed${failedCalendarCount === 1 ? "" : "s"} could not be loaded.`
        : "";
    const externalSourceSuffix =
      taskCollection.externalSourceFileCount > 0
        ? ` Included tasks from ${taskCollection.externalSourceFileCount} external source note${taskCollection.externalSourceFileCount === 1 ? "" : "s"}.`
        : "";
    const discoverySuffix =
      taskCollection.usedDataviewIndex &&
      taskCollection.externalSourceFileCount > 0
        ? " Used Dataview indexed discovery for external task lookup."
        : "";

    new Notice(
      `Generated ${generatedCount} time block${generatedCount === 1 ? "" : "s"}.${skippedSuffix}${calendarSuffix}${externalSourceSuffix}${discoverySuffix}`,
    );
  }

  private async collectTasksForPlanningNote(
    activeFile: TFile,
    activeContent: string,
    planningDate: Date,
  ): Promise<TaskCollectionResult> {
    const activeNoteTasks = this.extractOpenTasks(
      activeContent,
      activeFile.path,
    );
    const externalTaskDiscovery = this.getExternalTaskDiscovery(
      activeFile,
      planningDate,
    );
    const externalSourceFiles = externalTaskDiscovery.files;
    const externalTasks: ParsedTask[] = [];

    for (const externalSourceFile of externalSourceFiles) {
      const sourceContent = await this.app.vault.cachedRead(externalSourceFile);
      const sourceTasks = this.extractOpenTasks(
        sourceContent,
        externalSourceFile.path,
        true,
      ).filter((task) =>
        this.externalTaskMatchesPlanningDate(task.text, planningDate),
      );
      externalTasks.push(...sourceTasks);
    }

    const tasks = [...activeNoteTasks, ...externalTasks].sort(
      (leftTask, rightTask) =>
        this.getTaskPriorityRank(rightTask.priority) -
        this.getTaskPriorityRank(leftTask.priority),
    );

    return {
      tasks,
      externalSourceFileCount: externalSourceFiles.length,
      usedDataviewIndex: externalTaskDiscovery.usedDataviewIndex,
    };
  }

  private getExternalTaskDiscovery(
    activeFile: TFile,
    planningDate: Date,
  ): ExternalTaskDiscoveryResult {
    if (this.settings.externalTaskDiscoveryMode === "built-in") {
      return {
        files: this.getScopedExternalTaskFiles(activeFile),
        usedDataviewIndex: false,
      };
    }

    const dataviewFiles = this.getDataviewIndexedExternalTaskFiles(
      activeFile,
      planningDate,
    );
    if (dataviewFiles) {
      return {
        files: dataviewFiles,
        usedDataviewIndex: true,
      };
    }

    return {
      files: [],
      usedDataviewIndex: false,
    };
  }

  private extractOpenTasks(
    content: string,
    sourcePath: string,
    isExternalSource = false,
  ): ParsedTask[] {
    const lines = content.split(/\r?\n/);
    const tasks: ParsedTask[] = [];
    const taskStack: ParsedTask[] = [];
    const plannerSectionRange = this.findHeadingSectionRange(
      lines,
      this.settings.plannerHeading,
      this.settings.plannerHeadingLevel,
    );

    for (const [index, line] of lines.entries()) {
      if (
        plannerSectionRange &&
        index >= plannerSectionRange.start &&
        index < plannerSectionRange.end
      ) {
        continue;
      }

      const taskMatch = line.match(/^\s*[-*]\s+\[( )\]\s+(.*)$/);
      if (!taskMatch) {
        continue;
      }

      const indentMatch = line.match(/^(\s*)[-*]\s+\[( )\]\s+/);
      const rawText = taskMatch[2].trim();
      const parsedTimeRange = this.parseExplicitTaskTimeRange(rawText);
      const durationMinutes =
        parsedTimeRange?.durationMinutes ?? this.parseDurationMinutes(rawText);
      const parsedTask: ParsedTask = {
        text: this.cleanTaskText(rawText),
        durationMinutes,
        priority: this.parseTaskPriority(rawText),
        manualStartMinutes:
          parsedTimeRange?.startMinutes ??
          this.parseManualStartMinutes(rawText),
        statusMarker: taskMatch[1] as " ",
        indent: indentMatch?.[1].length ?? 0,
        sourcePath,
        sourceLineNumber: index + 1,
        isExternalSource,
        subtasks: [],
      };

      while (
        taskStack.length > 0 &&
        taskStack[taskStack.length - 1].indent >= parsedTask.indent
      ) {
        taskStack.pop();
      }

      const parentTask = taskStack[taskStack.length - 1];
      if (parentTask) {
        parentTask.subtasks.push(parsedTask);
      } else {
        tasks.push(parsedTask);
      }

      taskStack.push(parsedTask);
    }

    return tasks;
  }

  private getScopedExternalTaskFiles(activeFile: TFile): TFile[] {
    const normalizedNotePaths = this.settings.externalTaskNotePaths
      .map((path) => this.normalizeScopedSourcePath(path))
      .filter((path) => path.length > 0);
    const normalizedFolderPaths = this.settings.externalTaskFolderPaths
      .map((path) => this.normalizeScopedSourcePath(path))
      .filter((path) => path.length > 0);
    const sourceFiles = new Map<string, TFile>();

    for (const notePath of normalizedNotePaths) {
      const abstractFile = this.app.vault.getAbstractFileByPath(notePath);
      if (abstractFile instanceof TFile && abstractFile.extension === "md") {
        sourceFiles.set(abstractFile.path, abstractFile);
      }
    }

    for (const folderPath of normalizedFolderPaths) {
      const abstractFile = this.app.vault.getAbstractFileByPath(folderPath);
      if (!(abstractFile instanceof TFolder)) {
        continue;
      }

      this.collectMarkdownFilesFromFolder(abstractFile, sourceFiles);
    }

    sourceFiles.delete(activeFile.path);
    return [...sourceFiles.values()].sort((leftFile, rightFile) =>
      leftFile.path.localeCompare(rightFile.path),
    );
  }

  private async getDataviewDiscoveryDiagnostics(
    activeFile: TFile,
    planningDate: Date,
  ): Promise<DataviewDiscoveryDiagnostics> {
    const dataviewApi = this.getDataviewApi();
    if (!dataviewApi) {
      return {
        dataviewAvailable: false,
        indexedPageCount: 0,
        scopedIndexedPageCount: 0,
        resolvedMarkdownFileCount: 0,
        matchingExternalTaskCount: 0,
        scopedPagePaths: [],
        resolvedMarkdownPaths: [],
        matchingTaskSummaries: [],
      };
    }

    const indexedPages = this.normalizeDataviewPages(dataviewApi.pages());
    const scopedPagePaths: string[] = [];
    const resolvedMarkdownFiles = new Map<string, TFile>();

    for (const page of indexedPages) {
      const pagePath = page.file?.path;
      if (!pagePath || pagePath === activeFile.path) {
        continue;
      }

      scopedPagePaths.push(pagePath);
      const abstractFile = this.app.vault.getAbstractFileByPath(pagePath);
      if (abstractFile instanceof TFile && abstractFile.extension === "md") {
        resolvedMarkdownFiles.set(abstractFile.path, abstractFile);
      }
    }

    const matchingTaskSummaries: string[] = [];
    let matchingExternalTaskCount = 0;

    for (const resolvedFile of resolvedMarkdownFiles.values()) {
      const sourceContent = await this.app.vault.cachedRead(resolvedFile);
      const sourceTasks = this.extractOpenTasks(
        sourceContent,
        resolvedFile.path,
        true,
      ).filter((task) =>
        this.externalTaskMatchesPlanningDate(task.text, planningDate),
      );
      matchingExternalTaskCount += sourceTasks.length;
      for (const task of sourceTasks) {
        if (matchingTaskSummaries.length >= 10) {
          break;
        }

        matchingTaskSummaries.push(
          `${resolvedFile.path}#L${task.sourceLineNumber}: ${task.text}`,
        );
      }
    }

    return {
      dataviewAvailable: true,
      indexedPageCount: indexedPages.length,
      scopedIndexedPageCount: scopedPagePaths.length,
      resolvedMarkdownFileCount: resolvedMarkdownFiles.size,
      matchingExternalTaskCount,
      scopedPagePaths: scopedPagePaths.slice(0, 20),
      resolvedMarkdownPaths: [...resolvedMarkdownFiles.keys()].slice(0, 20),
      matchingTaskSummaries,
    };
  }

  private formatDataviewDiagnostics(
    diagnostics: DataviewDiscoveryDiagnostics,
  ): string {
    const lines = [
      `Dataview available: ${diagnostics.dataviewAvailable ? "yes" : "no"}`,
      `Indexed pages: ${diagnostics.indexedPageCount}`,
      `Scoped indexed pages: ${diagnostics.scopedIndexedPageCount}`,
      `Resolved markdown files: ${diagnostics.resolvedMarkdownFileCount}`,
      `Matching external tasks: ${diagnostics.matchingExternalTaskCount}`,
    ];

    if (diagnostics.scopedPagePaths.length > 0) {
      lines.push("", "Scoped pages:");
      for (const pagePath of diagnostics.scopedPagePaths) {
        lines.push(`- ${pagePath}`);
      }
    }

    if (diagnostics.resolvedMarkdownPaths.length > 0) {
      lines.push("", "Resolved markdown files:");
      for (const resolvedPath of diagnostics.resolvedMarkdownPaths) {
        lines.push(`- ${resolvedPath}`);
      }
    }

    if (diagnostics.matchingTaskSummaries.length > 0) {
      lines.push("", "Matching tasks:");
      for (const taskSummary of diagnostics.matchingTaskSummaries) {
        lines.push(`- ${taskSummary}`);
      }
    }

    return lines.join("\n");
  }

  private appendDebugLog(entry: string): void {
    const timestamp = new Date().toLocaleString();
    this.debugLogEntries.push(`[${timestamp}] ${entry}`);

    if (this.debugLogEntries.length > 100) {
      this.debugLogEntries.splice(0, this.debugLogEntries.length - 100);
    }

    this.queueDebugLogWrite();
  }

  private getDebugLogText(): string {
    if (this.debugLogEntries.length === 0) {
      return "No debug log entries yet.";
    }

    return this.debugLogEntries.join("\n\n");
  }

  private queueDebugLogWrite(): void {
    this.debugLogWritePromise = this.debugLogWritePromise
      .catch(() => undefined)
      .then(async () => {
        const logText = this.getDebugLogText();
        await this.app.vault.adapter.write(DEBUG_LOG_FILE_PATH, logText);
      })
      .catch((error) => {
        console.error("Failed to persist debug log", error);
      });
  }

  private async loadNodeIcal(): Promise<{
    parseICS: (rawCalendar: string) => Record<string, unknown>;
  }> {
    try {
      const importedModule = await import("node-ical");
      const candidate = (
        "default" in importedModule ? importedModule.default : importedModule
      ) as {
        parseICS?: (rawCalendar: string) => Record<string, unknown>;
      };

      if (typeof candidate.parseICS !== "function") {
        throw new Error("node-ical parseICS is unavailable");
      }

      return {
        parseICS: candidate.parseICS.bind(candidate),
      };
    } catch (error) {
      const formattedError = this.formatErrorForDebug(error);
      this.appendDebugLog(`Calendar parser load failed: ${formattedError}`);
      throw new Error(`Unable to load calendar parser: ${formattedError}`);
    }
  }

  private async loadMomentRuntime(): Promise<{
    moment: (value?: Date) => {
      utcOffset: () => number;
      clone: () => {
        subtract: (amount: number, unit: string) => { toDate: () => Date };
      };
      isSame: (other: Date, unit: string) => boolean;
      add: (amount: number, unit: string) => { toDate: () => Date };
      toDate: () => Date;
    };
    tz: {
      guess: () => string;
      zone: (tzid: string) => {
        utcOffset: (timestamp: number) => number;
      } | null;
    };
  }> {
    if (this.momentRuntime) {
      return this.momentRuntime;
    }

    try {
      const momentModule = await import("moment");
      const timezoneModule = await import("moment-timezone");
      const momentCandidate = (
        "default" in momentModule ? momentModule.default : momentModule
      ) as {
        (value?: Date): {
          utcOffset: () => number;
          clone: () => {
            subtract: (amount: number, unit: string) => { toDate: () => Date };
          };
          isSame: (other: Date, unit: string) => boolean;
          add: (amount: number, unit: string) => { toDate: () => Date };
          toDate: () => Date;
        };
      };
      const timezoneCandidate = timezoneModule as {
        tz?: {
          guess: () => string;
          zone: (tzid: string) => {
            utcOffset: (timestamp: number) => number;
          } | null;
        };
      };

      if (typeof momentCandidate !== "function" || !timezoneCandidate.tz) {
        throw new Error("moment runtime is unavailable");
      }

      this.momentRuntime = {
        moment: momentCandidate,
        tz: timezoneCandidate.tz,
      };
      return this.momentRuntime;
    } catch (error) {
      const formattedError = this.formatErrorForDebug(error);
      this.appendDebugLog(`Moment runtime load failed: ${formattedError}`);
      throw new Error(`Unable to load moment runtime: ${formattedError}`);
    }
  }

  private getDataviewIndexedExternalTaskFiles(
    activeFile: TFile,
    planningDate: Date,
  ): TFile[] | null {
    const dataviewApi = this.getDataviewApi();
    if (!dataviewApi) {
      return null;
    }

    const indexedPages = this.normalizeDataviewPages(dataviewApi.pages());
    const sourceFiles = new Map<string, TFile>();

    for (const page of indexedPages) {
      const pagePath = page.file?.path;
      if (!pagePath || pagePath === activeFile.path) {
        continue;
      }

      const abstractFile = this.app.vault.getAbstractFileByPath(pagePath);
      if (abstractFile instanceof TFile && abstractFile.extension === "md") {
        sourceFiles.set(abstractFile.path, abstractFile);
      }
    }

    return [...sourceFiles.values()].sort((leftFile, rightFile) =>
      leftFile.path.localeCompare(rightFile.path),
    );
  }

  private getDataviewApi(): DataviewApi | null {
    const plugins = (
      this.app as App & {
        plugins?: {
          plugins?: Record<string, { api?: DataviewApi }>;
        };
      }
    ).plugins;

    const dataviewPlugin = plugins?.plugins?.dataview;
    if (
      !dataviewPlugin?.api ||
      typeof dataviewPlugin.api.pages !== "function"
    ) {
      return null;
    }

    return dataviewPlugin.api;
  }

  private normalizeDataviewPages(value: unknown): DataviewPage[] {
    if (Array.isArray(value)) {
      return value as DataviewPage[];
    }

    if (
      value &&
      typeof value === "object" &&
      "array" in value &&
      typeof (value as DataviewArrayLike<DataviewPage>).array === "function"
    ) {
      return ((value as DataviewArrayLike<DataviewPage>).array?.() ??
        []) as DataviewPage[];
    }

    if (value && typeof value === "object" && "values" in value) {
      const values = (value as DataviewArrayLike<DataviewPage>).values;
      if (Array.isArray(values)) {
        return values as DataviewPage[];
      }

      if (
        values &&
        typeof values === "object" &&
        "array" in values &&
        typeof (values as { array?: () => DataviewPage[] }).array === "function"
      ) {
        return (values as { array: () => DataviewPage[] }).array();
      }
    }

    if (
      value &&
      typeof value === "object" &&
      Symbol.iterator in value &&
      typeof (value as DataviewArrayLike<DataviewPage>)[Symbol.iterator] ===
        "function"
    ) {
      return [...(value as Iterable<DataviewPage>)];
    }

    return [];
  }

  private isPathInExternalTaskScope(
    filePath: string,
    notePaths: Set<string>,
    folderPaths: string[],
  ): boolean {
    const normalizedPath = this.normalizeScopedSourcePath(filePath);
    if (notePaths.has(normalizedPath)) {
      return true;
    }

    return folderPaths.some(
      (folderPath) =>
        normalizedPath === folderPath ||
        normalizedPath.startsWith(`${folderPath}/`),
    );
  }

  private collectMarkdownFilesFromFolder(
    folder: TFolder,
    sourceFiles: Map<string, TFile>,
  ): void {
    for (const child of folder.children) {
      if (child instanceof TFile && child.extension === "md") {
        sourceFiles.set(child.path, child);
        continue;
      }

      if (child instanceof TFolder) {
        this.collectMarkdownFilesFromFolder(child, sourceFiles);
      }
    }
  }

  private normalizeScopedSourcePath(value: string): string {
    return value
      .replace(/\\/g, "/")
      .trim()
      .replace(/^\/+|\/+$/g, "");
  }

  private externalTaskMatchesPlanningDate(
    taskText: string,
    planningDate: Date,
  ): boolean {
    const dateTokens = this.extractTasksDateTokens(taskText);
    if (dateTokens.length === 0) {
      return false;
    }

    const planningDateStart = new Date(
      planningDate.getFullYear(),
      planningDate.getMonth(),
      planningDate.getDate(),
    );
    return dateTokens.some((dateToken) => {
      const tokenDate = this.parseDateKey(dateToken);
      return (
        tokenDate !== null && tokenDate.getTime() <= planningDateStart.getTime()
      );
    });
  }

  private extractTasksDateTokens(taskText: string): string[] {
    const matchedTokens = new Set<string>();
    const tokenPatterns = [
      /[📅⏳🛫]\s*(\d{4}-\d{2}-\d{2})/g,
      /(?:^|\s)>(\d{4}-\d{2}-\d{2})(?=\s|$)/g,
    ];

    for (const tokenPattern of tokenPatterns) {
      let match = tokenPattern.exec(taskText);
      while (match) {
        const normalizedDate = this.normalizeIsoDateToken(match[1]);
        if (normalizedDate) {
          matchedTokens.add(normalizedDate);
        }

        match = tokenPattern.exec(taskText);
      }
    }

    return [...matchedTokens];
  }

  private normalizeIsoDateToken(value: string): string | null {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return null;
    }

    const parsedDate = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
    );
    if (!Number.isFinite(parsedDate.getTime())) {
      return null;
    }

    return this.formatDateKey(parsedDate);
  }

  private parseDateKey(value: string): Date | null {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return null;
    }

    const parsedDate = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
    );
    if (!Number.isFinite(parsedDate.getTime())) {
      return null;
    }

    return new Date(
      parsedDate.getFullYear(),
      parsedDate.getMonth(),
      parsedDate.getDate(),
    );
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

  private parseTaskPriority(taskText: string): TaskPriority {
    if (taskText.includes("🔺")) {
      return "highest";
    }

    if (taskText.includes("⏫")) {
      return "high";
    }

    if (taskText.includes("🔼")) {
      return "medium";
    }

    if (taskText.includes("🔽")) {
      return "low";
    }

    if (taskText.includes("⏬")) {
      return "lowest";
    }

    return "none";
  }

  private parseExplicitTaskTimeRange(
    taskText: string,
  ): ParsedTaskTimeRange | null {
    const timeRangeMatch = taskText.match(
      /^\s*(\d{1,2}:\d{2})-(\d{1,2}:\d{2})(?=\s|$)/,
    );
    if (!timeRangeMatch) {
      return null;
    }

    const startMinutes = this.parseTimeToMinutesOrNull(timeRangeMatch[1]);
    const endMinutes = this.parseTimeToMinutesOrNull(timeRangeMatch[2]);
    if (
      startMinutes === null ||
      endMinutes === null ||
      endMinutes <= startMinutes
    ) {
      return null;
    }

    return {
      startMinutes,
      endMinutes,
      durationMinutes: endMinutes - startMinutes,
    };
  }

  private getTaskPriorityRank(priority: TaskPriority): number {
    return TASK_PRIORITY_RANKS[priority];
  }

  private cleanTaskText(taskText: string): string {
    return taskText
      .replace(/^\d{1,2}:\d{2}-\d{1,2}:\d{2}\s+/, "")
      .replace(/(^|\s)(\d{1,2}:\d{2})(?=\s|$)/, "$1")
      .replace(/\s+/g, " ")
      .trim();
  }

  private buildTaskSourceBacklink(task: ParsedTask): string {
    if (!task.isExternalSource || task.sourcePath.length === 0) {
      return "";
    }

    const normalizedPath = task.sourcePath.replace(/\.md$/i, "");
    return ` [[${normalizedPath}|↗]]`;
  }

  private escapePlannerDateTokens(taskText: string): string {
    return taskText.replace(
      /(^|\s)(?:([📅⏳🛫])\s*(\d{4}-\d{2}-\d{2})|(>)(\d{4}-\d{2}-\d{2}))(?=\s|$)/g,
      (
        _,
        leadingWhitespace: string,
        emojiMarker?: string,
        emojiDate?: string,
        plainMarker?: string,
        plainDate?: string,
      ) => {
        if (emojiMarker && emojiDate) {
          return `${leadingWhitespace}${emojiMarker} \`${emojiDate}\``;
        }

        if (plainMarker && plainDate) {
          return `${leadingWhitespace}\`${plainMarker}${plainDate}\``;
        }

        return _;
      },
    );
  }

  private buildTimeBlockLines(
    tasks: ParsedTask[],
    busyRanges: TimeRange[],
    planningDate: Date,
  ): GeneratedTimeBlocks {
    const scheduledLines: string[] = [];
    const unscheduledLines: string[] = [];
    let scheduledTaskCount = 0;
    const automaticTasks = tasks.filter(
      (task) => task.manualStartMinutes === null,
    );
    const manuallyTimedTasks = tasks
      .filter((task) => task.manualStartMinutes !== null)
      .sort(
        (leftTask, rightTask) =>
          (leftTask.manualStartMinutes ?? 0) -
          (rightTask.manualStartMinutes ?? 0),
      );
    let currentAutomaticStartMinutes =
      this.getInitialStartMinutes(planningDate);
    const configuredDayStartMinutes = this.parseTimeToMinutes(
      this.settings.dayStartTime,
    );
    const workDayEndMinutes = this.getWorkDayEndMinutes();
    const breakDurationMinutes = this.getValidatedBreakDurationMinutes();
    let skippedTaskCount = 0;
    const occupiedRanges = this.normalizeTimeRanges([
      ...busyRanges,
      { startMinutes: 0, endMinutes: configuredDayStartMinutes },
      { startMinutes: workDayEndMinutes, endMinutes: 1440 },
    ]);

    for (const task of manuallyTimedTasks) {
      const manualStartMinutes = task.manualStartMinutes ?? 0;
      const endMinutes = manualStartMinutes + task.durationMinutes;
      if (
        manualStartMinutes < configuredDayStartMinutes ||
        manualStartMinutes >= workDayEndMinutes ||
        endMinutes > workDayEndMinutes ||
        this.timeRangeOverlaps(
          { startMinutes: manualStartMinutes, endMinutes },
          occupiedRanges,
        )
      ) {
        skippedTaskCount += 1;
        unscheduledLines.push(...this.buildRenderedTaskLines(task));
        continue;
      }

      scheduledTaskCount += 1;
      scheduledLines.push(
        ...this.buildRenderedTaskLines(
          task,
          `${this.formatMinutesAsTime(manualStartMinutes)}-${this.formatMinutesAsTime(endMinutes)} `,
        ),
      );
      this.insertTimeRange(occupiedRanges, {
        startMinutes: manualStartMinutes,
        endMinutes: endMinutes + breakDurationMinutes,
      });
    }

    for (const task of automaticTasks) {
      const scheduledSegments = this.scheduleAutomaticTaskSegments(
        task,
        currentAutomaticStartMinutes,
        occupiedRanges,
        workDayEndMinutes,
      );

      if (scheduledSegments === null || scheduledSegments.length === 0) {
        skippedTaskCount += 1;
        unscheduledLines.push(...this.buildRenderedTaskLines(task));
        continue;
      }

      scheduledTaskCount += 1;
      for (const [
        segmentIndex,
        scheduledSegment,
      ] of scheduledSegments.entries()) {
        const prefix = `${this.formatMinutesAsTime(scheduledSegment.startMinutes)}-${this.formatMinutesAsTime(scheduledSegment.endMinutes)} `;
        if (segmentIndex === 0) {
          scheduledLines.push(...this.buildRenderedTaskLines(task, prefix));
          continue;
        }

        scheduledLines.push(
          `- [${task.statusMarker}] ${prefix}${this.escapePlannerDateTokens(task.text)}`,
        );
      }

      const finalScheduledSegment =
        scheduledSegments[scheduledSegments.length - 1];
      currentAutomaticStartMinutes =
        finalScheduledSegment.endMinutes + breakDurationMinutes;
    }

    return {
      scheduledLines,
      unscheduledLines,
      scheduledTaskCount,
      skippedTaskCount,
    };
  }

  private buildPlannerSectionBody(
    generatedTimeBlocks: GeneratedTimeBlocks,
  ): string {
    const lines = [...generatedTimeBlocks.scheduledLines];

    if (generatedTimeBlocks.unscheduledLines.length > 0) {
      lines.push("");
      lines.push(this.buildPlannerSubheadingLine("Not Time Blocked"));
      lines.push(...generatedTimeBlocks.unscheduledLines);
    }

    return lines.join("\n");
  }

  private buildPlannerSubheadingLine(title: string): string {
    const normalizedPlannerHeadingLevel = Math.min(
      Math.max(Math.floor(this.settings.plannerHeadingLevel), 1),
      6,
    );

    if (normalizedPlannerHeadingLevel >= 6) {
      return `**${title}**`;
    }

    return `${"#".repeat(normalizedPlannerHeadingLevel + 1)} ${title}`;
  }

  private buildRenderedTaskLines(
    task: ParsedTask,
    prefix = "",
    depth = 0,
  ): string[] {
    const indentation = "    ".repeat(depth);
    const renderedTaskText = `${this.escapePlannerDateTokens(task.text)}${this.buildTaskSourceBacklink(task)}`;
    const renderedLines = [
      `${indentation}- [${task.statusMarker}] ${prefix}${renderedTaskText}`,
    ];

    for (const subtask of task.subtasks) {
      renderedLines.push(
        ...this.buildRenderedTaskLines(subtask, "", depth + 1),
      );
    }

    return renderedLines;
  }

  private getInitialStartMinutes(planningDate: Date): number {
    const configuredStartMinutes = this.parseTimeToMinutes(
      this.settings.dayStartTime,
    );
    if (!this.isSameLocalDate(this.getTodayDate(), planningDate)) {
      return configuredStartMinutes;
    }

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startingMinutes =
      this.getAutomaticStartMode() === "now"
        ? currentMinutes
        : this.snapMinutesToInterval(currentMinutes);

    return Math.max(configuredStartMinutes, startingMinutes);
  }

  private getWorkDayEndMinutes(): number {
    const configuredEndMinutes = this.parseTimeToMinutes(
      this.settings.workDayEndTime,
    );
    const configuredStartMinutes = this.parseTimeToMinutes(
      this.settings.dayStartTime,
    );

    return configuredEndMinutes >= configuredStartMinutes
      ? configuredEndMinutes
      : this.parseTimeToMinutes(DEFAULT_SETTINGS.workDayEndTime);
  }

  private snapMinutesToInterval(totalMinutes: number): number {
    const interval = this.getValidatedStartIntervalMinutes();
    return Math.ceil(totalMinutes / interval) * interval;
  }

  private getValidatedStartIntervalMinutes(): number {
    const interval = Math.floor(this.settings.startIntervalMinutes);

    if (!Number.isFinite(interval) || interval <= 0) {
      return DEFAULT_SETTINGS.startIntervalMinutes;
    }

    return interval;
  }

  private getAutomaticStartMode(): AutomaticStartMode {
    return this.settings.automaticStartMode === "now" ? "now" : "snapped";
  }

  private getValidatedBreakDurationMinutes(): number {
    const breakDuration = Math.floor(this.settings.breakDurationMinutes);

    if (!Number.isFinite(breakDuration) || breakDuration < 0) {
      return DEFAULT_SETTINGS.breakDurationMinutes;
    }

    return breakDuration;
  }

  private getValidatedMeetingBufferBeforeMinutes(): number {
    const meetingBuffer = Math.floor(this.settings.meetingBufferBeforeMinutes);

    if (!Number.isFinite(meetingBuffer) || meetingBuffer < 0) {
      return DEFAULT_SETTINGS.meetingBufferBeforeMinutes;
    }

    return meetingBuffer;
  }

  private getValidatedMeetingBufferAfterMinutes(): number {
    const meetingBuffer = Math.floor(this.settings.meetingBufferAfterMinutes);

    if (!Number.isFinite(meetingBuffer) || meetingBuffer < 0) {
      return DEFAULT_SETTINGS.meetingBufferAfterMinutes;
    }

    return meetingBuffer;
  }

  private normalizeTimeRanges(ranges: TimeRange[]): TimeRange[] {
    const sortedRanges = ranges
      .filter((range) => range.endMinutes > range.startMinutes)
      .sort(
        (leftRange, rightRange) =>
          leftRange.startMinutes - rightRange.startMinutes,
      );
    const mergedRanges: TimeRange[] = [];

    for (const range of sortedRanges) {
      const previousRange = mergedRanges[mergedRanges.length - 1];
      if (!previousRange || range.startMinutes > previousRange.endMinutes) {
        mergedRanges.push({ ...range });
        continue;
      }

      previousRange.endMinutes = Math.max(
        previousRange.endMinutes,
        range.endMinutes,
      );
    }

    return mergedRanges;
  }

  private insertTimeRange(ranges: TimeRange[], rangeToInsert: TimeRange): void {
    const normalizedRanges = this.normalizeTimeRanges([
      ...ranges,
      rangeToInsert,
    ]);
    ranges.splice(0, ranges.length, ...normalizedRanges);
  }

  private timeRangeOverlaps(
    range: TimeRange,
    occupiedRanges: TimeRange[],
  ): boolean {
    return occupiedRanges.some(
      (occupiedRange) =>
        range.startMinutes < occupiedRange.endMinutes &&
        range.endMinutes > occupiedRange.startMinutes,
    );
  }

  private findNextAvailableStartMinutes(
    proposedStartMinutes: number,
    durationMinutes: number,
    occupiedRanges: TimeRange[],
    workDayEndMinutes: number,
  ): number {
    let nextStartMinutes = proposedStartMinutes;

    while (nextStartMinutes < workDayEndMinutes) {
      const candidateEndMinutes = nextStartMinutes + durationMinutes;
      const overlappingRange = occupiedRanges.find(
        (occupiedRange) =>
          nextStartMinutes < occupiedRange.endMinutes &&
          candidateEndMinutes > occupiedRange.startMinutes,
      );

      if (!overlappingRange) {
        return nextStartMinutes;
      }

      nextStartMinutes = overlappingRange.endMinutes;
    }

    return workDayEndMinutes;
  }

  private findNextAvailableWindow(
    proposedStartMinutes: number,
    occupiedRanges: TimeRange[],
    workDayEndMinutes: number,
  ): TimeRange {
    let nextStartMinutes = proposedStartMinutes;

    while (nextStartMinutes < workDayEndMinutes) {
      const containingRange = occupiedRanges.find(
        (occupiedRange) =>
          nextStartMinutes >= occupiedRange.startMinutes &&
          nextStartMinutes < occupiedRange.endMinutes,
      );

      if (containingRange) {
        nextStartMinutes = containingRange.endMinutes;
        continue;
      }

      const nextOccupiedRange = occupiedRanges.find(
        (occupiedRange) => occupiedRange.startMinutes > nextStartMinutes,
      );

      return {
        startMinutes: nextStartMinutes,
        endMinutes: Math.min(
          nextOccupiedRange?.startMinutes ?? workDayEndMinutes,
          workDayEndMinutes,
        ),
      };
    }

    return {
      startMinutes: workDayEndMinutes,
      endMinutes: workDayEndMinutes,
    };
  }

  private scheduleAutomaticTaskSegments(
    task: ParsedTask,
    proposedStartMinutes: number,
    occupiedRanges: TimeRange[],
    workDayEndMinutes: number,
  ): ScheduledTaskSegment[] | null {
    const breakDurationMinutes = this.getValidatedBreakDurationMinutes();

    if (!this.settings.splitTasksAcrossGaps) {
      const scheduledStartMinutes = this.findNextAvailableStartMinutes(
        proposedStartMinutes,
        task.durationMinutes,
        occupiedRanges,
        workDayEndMinutes,
      );
      const scheduledEndMinutes = scheduledStartMinutes + task.durationMinutes;

      if (
        scheduledStartMinutes >= workDayEndMinutes ||
        scheduledEndMinutes > workDayEndMinutes
      ) {
        return null;
      }

      this.insertTimeRange(occupiedRanges, {
        startMinutes: scheduledStartMinutes,
        endMinutes: scheduledEndMinutes + breakDurationMinutes,
      });

      return [
        {
          startMinutes: scheduledStartMinutes,
          endMinutes: scheduledEndMinutes,
        },
      ];
    }

    const candidateOccupiedRanges = occupiedRanges.map((range) => ({
      ...range,
    }));
    const scheduledSegments: ScheduledTaskSegment[] = [];
    let remainingDurationMinutes = task.durationMinutes;
    let nextProposedStartMinutes = proposedStartMinutes;

    while (remainingDurationMinutes > 0) {
      const availableWindow = this.findNextAvailableWindow(
        nextProposedStartMinutes,
        candidateOccupiedRanges,
        workDayEndMinutes,
      );

      if (availableWindow.endMinutes <= availableWindow.startMinutes) {
        return null;
      }

      const availableDurationMinutes =
        availableWindow.endMinutes - availableWindow.startMinutes;

      if (availableDurationMinutes <= 0) {
        return null;
      }

      const scheduledDurationMinutes = Math.min(
        remainingDurationMinutes,
        availableDurationMinutes,
      );
      const scheduledSegment: ScheduledTaskSegment = {
        startMinutes: availableWindow.startMinutes,
        endMinutes: availableWindow.startMinutes + scheduledDurationMinutes,
      };

      scheduledSegments.push(scheduledSegment);
      this.insertTimeRange(candidateOccupiedRanges, scheduledSegment);
      remainingDurationMinutes -= scheduledDurationMinutes;
      nextProposedStartMinutes = scheduledSegment.endMinutes;
    }

    const finalScheduledSegment =
      scheduledSegments[scheduledSegments.length - 1];
    this.insertTimeRange(candidateOccupiedRanges, {
      startMinutes: finalScheduledSegment.endMinutes,
      endMinutes: finalScheduledSegment.endMinutes + breakDurationMinutes,
    });
    occupiedRanges.splice(0, occupiedRanges.length, ...candidateOccupiedRanges);
    return scheduledSegments;
  }

  private parseManualStartMinutes(taskText: string): number | null {
    const timeMatch = taskText.match(/(?:^|\s)(\d{1,2}:\d{2})(?=\s|$)/);
    if (!timeMatch) {
      return null;
    }

    const parsedMinutes = this.parseTimeToMinutesOrNull(timeMatch[1]);
    return parsedMinutes;
  }

  private parseTimeToMinutesOrNull(value: string): number | null {
    const match = value.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) {
      return null;
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);

    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return null;
    }

    return hours * 60 + minutes;
  }

  private parseTimeToMinutes(value: string): number {
    const parsedMinutes = this.parseTimeToMinutesOrNull(value);
    if (parsedMinutes === null) {
      return this.parseTimeToMinutes(DEFAULT_SETTINGS.dayStartTime);
    }

    return parsedMinutes;
  }

  private formatMinutesAsTime(totalMinutes: number): string {
    const normalizedMinutes = ((totalMinutes % 1440) + 1440) % 1440;
    const hours = Math.floor(normalizedMinutes / 60);
    const minutes = normalizedMinutes % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
  }

  private resolvePlanningDate(fileBasename: string): Date {
    const hyphenatedDateMatch = fileBasename.match(
      /\b(\d{4})-(\d{2})-(\d{2})\b/,
    );
    if (hyphenatedDateMatch) {
      return new Date(
        Number(hyphenatedDateMatch[1]),
        Number(hyphenatedDateMatch[2]) - 1,
        Number(hyphenatedDateMatch[3]),
      );
    }

    const compactDateMatch = fileBasename.match(/\b(\d{4})(\d{2})(\d{2})\b/);
    if (compactDateMatch) {
      return new Date(
        Number(compactDateMatch[1]),
        Number(compactDateMatch[2]) - 1,
        Number(compactDateMatch[3]),
      );
    }

    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), today.getDate());
  }

  private getTodayDate(): Date {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), today.getDate());
  }

  private isSameLocalDate(leftDate: Date, rightDate: Date): boolean {
    return (
      leftDate.getFullYear() === rightDate.getFullYear() &&
      leftDate.getMonth() === rightDate.getMonth() &&
      leftDate.getDate() === rightDate.getDate()
    );
  }

  normalizeRemoteCalendarUrl(value: string): string {
    return value.trim().replace(/^webcal:\/\//i, "https://");
  }

  private getCalendarCacheKey(planningDate: Date): string {
    return [
      this.formatDateKey(planningDate),
      this.settings.remoteCalendarUrls.join("\n"),
      String(this.getValidatedMeetingBufferBeforeMinutes()),
      String(this.getValidatedMeetingBufferAfterMinutes()),
      this.settings.ignoredCalendarEventPatterns,
    ].join("::");
  }

  private async getCalendarPreviewData(
    planningDate: Date,
    forceRefresh: boolean,
  ): Promise<CalendarPreviewData> {
    const cacheKey = this.getCalendarCacheKey(planningDate);
    if (!forceRefresh) {
      const cachedPreviewData = this.calendarPreviewCache.get(cacheKey);
      if (cachedPreviewData) {
        return cachedPreviewData;
      }
    }

    const previewData = await this.getBusyCalendarRangesForDate(planningDate);
    const resolvedPreviewData: CalendarPreviewData = {
      ...previewData,
      planningDate,
    };
    this.calendarPreviewCache.set(cacheKey, resolvedPreviewData);
    return resolvedPreviewData;
  }

  private async getBusyCalendarRangesForDate(planningDate: Date): Promise<{
    matchedEvents: CalendarBusyRange[];
    busyRanges: CalendarBusyRange[];
    failedCalendarCount: number;
    loadedCalendarCount: number;
    eventDiagnostics: CalendarEventDiagnostic[];
  }> {
    const remoteCalendars = this.settings.remoteCalendarUrls
      .map((calendarUrl) => this.normalizeRemoteCalendarUrl(calendarUrl))
      .filter((calendarUrl) => calendarUrl.length > 0);

    if (remoteCalendars.length === 0) {
      return {
        matchedEvents: [],
        busyRanges: [],
        failedCalendarCount: 0,
        loadedCalendarCount: 0,
        eventDiagnostics: [],
      };
    }

    const matchedEvents: CalendarBusyRange[] = [];
    const eventDiagnostics: CalendarEventDiagnostic[] = [];
    let failedCalendarCount = 0;
    let loadedCalendarCount = 0;

    for (const calendarUrl of remoteCalendars) {
      try {
        const response = await requestUrl({
          url: calendarUrl,
          method: "GET",
        });
        if (response.status < 200 || response.status >= 300) {
          throw new Error(
            `Calendar request failed with status ${response.status}`,
          );
        }

        const rawCalendar = response.text;
        const extractionResult = await this.extractBusyRangesFromIcs(
          rawCalendar,
          planningDate,
        );
        matchedEvents.push(...extractionResult.busyRanges);
        eventDiagnostics.push(...extractionResult.eventDiagnostics);
        loadedCalendarCount += 1;
      } catch (error) {
        console.error("Failed to load ICS calendar", calendarUrl, error);
        failedCalendarCount += 1;
      }
    }

    return {
      matchedEvents,
      busyRanges: this.normalizeCalendarBusyRanges(matchedEvents),
      failedCalendarCount,
      loadedCalendarCount,
      eventDiagnostics,
    };
  }

  private async extractBusyRangesFromIcs(
    rawCalendar: string,
    planningDate: Date,
  ): Promise<{
    busyRanges: CalendarBusyRange[];
    eventDiagnostics: CalendarEventDiagnostic[];
  }> {
    const dayStart = new Date(
      planningDate.getFullYear(),
      planningDate.getMonth(),
      planningDate.getDate(),
      0,
      0,
      0,
      0,
    );
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const nodeIcal = await this.loadNodeIcal();
    await this.loadMomentRuntime();
    const calendarEntries = Object.values(
      nodeIcal.parseICS(rawCalendar) as Record<string, any>,
    );
    const busyRanges: CalendarBusyRange[] = [];
    const eventDiagnostics: CalendarEventDiagnostic[] = [];

    for (const calendarEntry of calendarEntries) {
      if (!calendarEntry || calendarEntry.type !== "VEVENT") {
        continue;
      }

      const summary = String(calendarEntry.summary ?? "Untitled event");
      const uid = String(calendarEntry.uid ?? "");
      const startDate =
        calendarEntry.start instanceof Date
          ? calendarEntry.start
          : new Date(calendarEntry.start ?? Number.NaN);
      const endDate =
        calendarEntry.end instanceof Date
          ? calendarEntry.end
          : new Date(calendarEntry.end ?? Number.NaN);

      if (this.shouldIgnoreCalendarEvent(summary)) {
        eventDiagnostics.push(
          this.buildCalendarEventDiagnostic(
            summary,
            uid,
            startDate,
            endDate,
            calendarEntry.rrule?.toString?.() ?? null,
            false,
            "Ignored by event pattern",
          ),
        );
        continue;
      }

      if (
        !Number.isFinite(startDate.getTime()) ||
        !Number.isFinite(endDate.getTime())
      ) {
        eventDiagnostics.push(
          this.buildCalendarEventDiagnostic(
            summary,
            uid,
            startDate,
            endDate,
            calendarEntry.rrule?.toString?.() ?? null,
            false,
            "Invalid event date parse",
          ),
        );
        continue;
      }

      const occurrenceRanges = this.expandNodeIcalEventOccurrencesForDay(
        calendarEntry,
        dayStart,
        dayEnd,
      );
      if (occurrenceRanges.length === 0) {
        eventDiagnostics.push(
          this.buildCalendarEventDiagnostic(
            summary,
            uid,
            startDate,
            endDate,
            calendarEntry.rrule?.toString?.() ?? null,
            false,
            "No occurrence on planning day",
          ),
        );
        continue;
      }

      let includedOccurrence = false;
      for (const occurrenceRange of occurrenceRanges) {
        if (
          occurrenceRange.end <= dayStart ||
          occurrenceRange.start >= dayEnd
        ) {
          continue;
        }

        const clampedStart =
          occurrenceRange.start < dayStart ? dayStart : occurrenceRange.start;
        const clampedEnd =
          occurrenceRange.end > dayEnd ? dayEnd : occurrenceRange.end;
        const startMinutes =
          clampedStart.getHours() * 60 + clampedStart.getMinutes();
        const endMinutes = clampedEnd.getHours() * 60 + clampedEnd.getMinutes();

        if (endMinutes <= startMinutes) {
          continue;
        }

        busyRanges.push({
          startMinutes,
          endMinutes,
          summary,
          uid,
        });
        includedOccurrence = true;
      }

      eventDiagnostics.push(
        this.buildCalendarEventDiagnostic(
          summary,
          uid,
          startDate,
          endDate,
          calendarEntry.rrule?.toString?.() ?? null,
          includedOccurrence,
          includedOccurrence
            ? "Included in busy calendar ranges"
            : "Occurrence resolved outside visible day window",
        ),
      );
    }

    return {
      busyRanges,
      eventDiagnostics,
    };
  }

  private expandNodeIcalEventOccurrencesForDay(
    calendarEntry: any,
    dayStart: Date,
    dayEnd: Date,
  ): Array<{ start: Date; end: Date }> {
    const momentRuntime = this.momentRuntime;
    const startDate =
      calendarEntry.start instanceof Date
        ? calendarEntry.start
        : new Date(calendarEntry.start ?? Number.NaN);
    const endDate =
      calendarEntry.end instanceof Date
        ? calendarEntry.end
        : new Date(calendarEntry.end ?? Number.NaN);

    if (
      !Number.isFinite(startDate.getTime()) ||
      !Number.isFinite(endDate.getTime())
    ) {
      return [];
    }

    if (calendarEntry.rrule?.between) {
      const durationMilliseconds = Math.max(
        endDate.getTime() - startDate.getTime(),
        0,
      );
      const occurrenceStarts = calendarEntry.rrule.between(
        dayStart,
        new Date(dayEnd.getTime() + 24 * 60 * 60 * 1000),
        true,
      ) as Date[];
      const occurrences: Array<{ start: Date; end: Date }> = [];

      for (const occurrenceStart of occurrenceStarts) {
        if (
          momentRuntime &&
          this.nodeIcalHasExcludedOccurrence(
            calendarEntry,
            occurrenceStart,
            momentRuntime,
          )
        ) {
          continue;
        }

        const overrideOccurrence = this.findNodeIcalOverrideOccurrence(
          calendarEntry,
          occurrenceStart,
        );
        if (overrideOccurrence) {
          occurrences.push(overrideOccurrence);
          continue;
        }

        const adjustedOccurrenceStart = this.adjustNodeIcalOccurrenceStart(
          calendarEntry,
          occurrenceStart,
          momentRuntime,
        );
        occurrences.push({
          start: adjustedOccurrenceStart,
          end: new Date(
            adjustedOccurrenceStart.getTime() + durationMilliseconds,
          ),
        });
      }

      return occurrences;
    }

    return [{ start: startDate, end: endDate }];
  }

  private nodeIcalHasExcludedOccurrence(
    calendarEntry: any,
    occurrenceStart: Date,
    momentRuntime: {
      moment: (value?: Date) => {
        utcOffset: () => number;
        clone: () => {
          subtract: (amount: number, unit: string) => { toDate: () => Date };
        };
        isSame: (other: Date, unit: string) => boolean;
        add: (amount: number, unit: string) => { toDate: () => Date };
        toDate: () => Date;
      };
    },
  ): boolean {
    const exdates = Object.values(calendarEntry.exdate ?? {}) as any[];
    return exdates.some((exceptionDateValue) => {
      const exceptionDate =
        exceptionDateValue instanceof Date
          ? exceptionDateValue
          : exceptionDateValue?.start instanceof Date
            ? exceptionDateValue.start
            : new Date(exceptionDateValue ?? Number.NaN);

      if (!Number.isFinite(exceptionDate.getTime())) {
        return false;
      }

      const occurrenceMoment = momentRuntime.moment(occurrenceStart);
      const utcOffset = occurrenceMoment.utcOffset();
      const occurrenceDateWithoutOffset = occurrenceMoment
        .clone()
        .subtract(utcOffset, "minutes");

      return momentRuntime
        .moment(exceptionDate)
        .isSame(occurrenceDateWithoutOffset.toDate(), "day");
    });
  }

  private adjustNodeIcalOccurrenceStart(
    calendarEntry: any,
    occurrenceStart: Date,
    momentRuntime: {
      moment: (value?: Date) => {
        utcOffset: () => number;
        clone: () => {
          subtract: (amount: number, unit: string) => { toDate: () => Date };
        };
        isSame: (other: Date, unit: string) => boolean;
        add: (amount: number, unit: string) => { toDate: () => Date };
        toDate: () => Date;
      };
      tz: {
        guess: () => string;
        zone: (tzid: string) => {
          utcOffset: (timestamp: number) => number;
        } | null;
      };
    },
  ): Date {
    const tzid = calendarEntry.rrule?.origOptions?.tzid;
    if (!tzid) {
      return new Date(occurrenceStart);
    }

    let adjustedMoment = this.adjustForDst(
      tzid,
      calendarEntry.start instanceof Date
        ? calendarEntry.start
        : new Date(calendarEntry.start ?? occurrenceStart),
      occurrenceStart,
      momentRuntime,
    );
    adjustedMoment = this.adjustForOtherZones(
      tzid,
      adjustedMoment.toDate(),
      momentRuntime,
    );
    return adjustedMoment.toDate();
  }

  private adjustForOtherZones(
    tzid: string,
    currentDate: Date,
    momentRuntime: {
      moment: (value?: Date) => {
        utcOffset: () => number;
        clone: () => {
          subtract: (amount: number, unit: string) => { toDate: () => Date };
        };
        isSame: (other: Date, unit: string) => boolean;
        add: (amount: number, unit: string) => { toDate: () => Date };
        toDate: () => Date;
      };
      tz: {
        guess: () => string;
        zone: (tzid: string) => {
          utcOffset: (timestamp: number) => number;
        } | null;
      };
    },
  ) {
    const localTzid = momentRuntime.tz.guess();

    if (tzid === localTzid) {
      return momentRuntime.moment(currentDate);
    }

    const localTimezone = momentRuntime.tz.zone(localTzid);
    const originalTimezone = momentRuntime.tz.zone(tzid);

    if (!localTimezone || !originalTimezone) {
      return momentRuntime.moment(currentDate);
    }

    const offset =
      localTimezone.utcOffset(currentDate.getTime()) -
      originalTimezone.utcOffset(currentDate.getTime());

    return momentRuntime.moment(currentDate).add(offset, "minutes");
  }

  private adjustForDst(
    tzid: string,
    originalDate: Date,
    currentDate: Date,
    momentRuntime: {
      moment: (value?: Date) => {
        utcOffset: () => number;
        clone: () => {
          subtract: (amount: number, unit: string) => { toDate: () => Date };
        };
        isSame: (other: Date, unit: string) => boolean;
        add: (amount: number, unit: string) => { toDate: () => Date };
        toDate: () => Date;
      };
      tz: {
        guess: () => string;
        zone: (tzid: string) => {
          utcOffset: (timestamp: number) => number;
        } | null;
      };
    },
  ) {
    const timezone = momentRuntime.tz.zone(tzid);

    if (!timezone) {
      return momentRuntime.moment(currentDate);
    }

    const offset =
      timezone.utcOffset(currentDate.getTime()) -
      timezone.utcOffset(originalDate.getTime());

    return momentRuntime.moment(currentDate).add(offset, "minutes");
  }

  private findNodeIcalOverrideOccurrence(
    calendarEntry: any,
    occurrenceStart: Date,
  ): { start: Date; end: Date } | null {
    const recurrenceOverrides = Object.values(
      calendarEntry.recurrences ?? {},
    ) as any[];
    for (const recurrenceOverride of recurrenceOverrides) {
      const overrideStart =
        recurrenceOverride?.start instanceof Date
          ? recurrenceOverride.start
          : new Date(recurrenceOverride?.start ?? Number.NaN);
      const overrideEnd =
        recurrenceOverride?.end instanceof Date
          ? recurrenceOverride.end
          : new Date(recurrenceOverride?.end ?? Number.NaN);

      if (
        Number.isFinite(overrideStart.getTime()) &&
        Number.isFinite(overrideEnd.getTime()) &&
        overrideStart.getTime() === occurrenceStart.getTime()
      ) {
        return {
          start: overrideStart,
          end: overrideEnd,
        };
      }
    }

    return null;
  }

  private buildCalendarEventDiagnostic(
    summary: string,
    uid: string,
    startDate: Date,
    endDate: Date,
    recurrenceRule: string | null,
    included: boolean,
    reason: string,
  ): CalendarEventDiagnostic {
    return {
      summary,
      uid,
      startText: Number.isFinite(startDate.getTime())
        ? startDate.toLocaleString()
        : "Invalid start",
      endText: Number.isFinite(endDate.getTime())
        ? endDate.toLocaleString()
        : "Invalid end",
      recurrenceRule,
      included,
      reason,
    };
  }

  private normalizeCalendarBusyRanges(
    ranges: CalendarBusyRange[],
  ): CalendarBusyRange[] {
    const meetingBufferBeforeMinutes =
      this.getValidatedMeetingBufferBeforeMinutes();
    const meetingBufferAfterMinutes =
      this.getValidatedMeetingBufferAfterMinutes();
    const sortedRanges = ranges
      .map((range) => ({
        ...range,
        startMinutes: Math.max(
          0,
          range.startMinutes - meetingBufferBeforeMinutes,
        ),
        endMinutes: Math.min(
          1440,
          range.endMinutes + meetingBufferAfterMinutes,
        ),
      }))
      .filter((range) => range.endMinutes > range.startMinutes)
      .sort(
        (leftRange, rightRange) =>
          leftRange.startMinutes - rightRange.startMinutes,
      );
    const mergedRanges: CalendarBusyRange[] = [];

    for (const range of sortedRanges) {
      const previousRange = mergedRanges[mergedRanges.length - 1];
      if (!previousRange || range.startMinutes > previousRange.endMinutes) {
        mergedRanges.push({ ...range });
        continue;
      }

      previousRange.endMinutes = Math.max(
        previousRange.endMinutes,
        range.endMinutes,
      );
    }

    return mergedRanges;
  }

  private parseIcsEvents(rawCalendar: string): ParsedIcsEvent[] {
    const unfoldedLines = rawCalendar
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\n[ \t]/g, "")
      .split("\n");
    const events: ParsedIcsEvent[] = [];
    let currentEvent: ParsedIcsEvent | null = null;

    for (const line of unfoldedLines) {
      if (line === "BEGIN:VEVENT") {
        currentEvent = {
          uid: "",
          summary: "",
          start: new Date(Number.NaN),
          end: new Date(Number.NaN),
          recurrenceRule: null,
          recurrenceId: null,
          exceptionDates: [],
        };
        continue;
      }

      if (line === "END:VEVENT") {
        if (
          currentEvent &&
          currentEvent.uid.length > 0 &&
          Number.isFinite(currentEvent.start.getTime()) &&
          Number.isFinite(currentEvent.end.getTime()) &&
          currentEvent.end.getTime() > currentEvent.start.getTime()
        ) {
          events.push(currentEvent);
        }
        currentEvent = null;
        continue;
      }

      if (!currentEvent) {
        continue;
      }

      const separatorIndex = line.indexOf(":");
      if (separatorIndex === -1) {
        continue;
      }

      const propertyWithParams = line.slice(0, separatorIndex);
      const propertyValue = line.slice(separatorIndex + 1);
      const [propertyName, ...parameterValues] = propertyWithParams.split(";");
      const params = new Map<string, string>();

      for (const parameterValue of parameterValues) {
        const [parameterName, parameterContent] = parameterValue.split("=");
        if (!parameterName || !parameterContent) {
          continue;
        }

        params.set(parameterName.toUpperCase(), parameterContent);
      }

      switch (propertyName.toUpperCase()) {
        case "UID":
          currentEvent.uid = propertyValue.trim();
          break;
        case "SUMMARY":
          currentEvent.summary = this.decodeIcsText(propertyValue.trim());
          break;
        case "DTSTART": {
          const parsedDate = this.parseIcsDateValue(
            propertyValue.trim(),
            params,
          );
          if (parsedDate) {
            currentEvent.start = parsedDate;
          }
          break;
        }
        case "DTEND": {
          const parsedDate = this.parseIcsDateValue(
            propertyValue.trim(),
            params,
          );
          if (parsedDate) {
            currentEvent.end = parsedDate;
          }
          break;
        }
        case "DURATION": {
          if (Number.isFinite(currentEvent.start.getTime())) {
            const durationMilliseconds = this.parseIcsDurationToMilliseconds(
              propertyValue.trim(),
            );
            if (durationMilliseconds > 0) {
              currentEvent.end = new Date(
                currentEvent.start.getTime() + durationMilliseconds,
              );
            }
          }
          break;
        }
        case "RRULE":
          currentEvent.recurrenceRule = propertyValue.trim();
          break;
        case "RECURRENCE-ID": {
          const parsedDate = this.parseIcsDateValue(
            propertyValue.trim(),
            params,
          );
          if (parsedDate) {
            currentEvent.recurrenceId = parsedDate;
          }
          break;
        }
        case "EXDATE": {
          const parsedDates = propertyValue
            .split(",")
            .map((value) => this.parseIcsDateValue(value.trim(), params))
            .filter((value): value is Date => value instanceof Date);
          currentEvent.exceptionDates.push(...parsedDates);
          break;
        }
      }
    }

    return events;
  }

  private decodeIcsText(value: string): string {
    return value
      .replace(/\\n/gi, "\n")
      .replace(/\\,/g, ",")
      .replace(/\\;/g, ";")
      .replace(/\\\\/g, "\\");
  }

  private parseIcsDateValue(
    value: string,
    params: Map<string, string>,
  ): Date | null {
    const valueType = params.get("VALUE")?.toUpperCase();

    if (valueType === "DATE" || /^\d{8}$/.test(value)) {
      const year = Number(value.slice(0, 4));
      const month = Number(value.slice(4, 6)) - 1;
      const day = Number(value.slice(6, 8));
      return new Date(year, month, day, 0, 0, 0, 0);
    }

    const dateTimeMatch = value.match(
      /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/,
    );
    if (!dateTimeMatch) {
      return null;
    }

    const year = Number(dateTimeMatch[1]);
    const month = Number(dateTimeMatch[2]) - 1;
    const day = Number(dateTimeMatch[3]);
    const hours = Number(dateTimeMatch[4]);
    const minutes = Number(dateTimeMatch[5]);
    const seconds = Number(dateTimeMatch[6]);

    if (value.endsWith("Z")) {
      return new Date(Date.UTC(year, month, day, hours, minutes, seconds));
    }

    return new Date(year, month, day, hours, minutes, seconds, 0);
  }

  private parseIcsDurationToMilliseconds(value: string): number {
    const durationMatch = value.match(
      /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/,
    );
    if (!durationMatch) {
      return 0;
    }

    const weeks = Number(durationMatch[1] ?? 0);
    const days = Number(durationMatch[2] ?? 0);
    const hours = Number(durationMatch[3] ?? 0);
    const minutes = Number(durationMatch[4] ?? 0);
    const seconds = Number(durationMatch[5] ?? 0);

    return (
      ((((weeks * 7 + days) * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000
    );
  }

  private shouldIgnoreCalendarEvent(eventSummary: string): boolean {
    const ignoredPatterns = this.settings.ignoredCalendarEventPatterns
      .split(/\r?\n/)
      .map((line) => line.trim().toLowerCase())
      .filter((line) => line.length > 0);

    if (ignoredPatterns.length === 0) {
      return false;
    }

    const normalizedSummary = eventSummary.toLowerCase();
    return ignoredPatterns.some((pattern) =>
      normalizedSummary.includes(pattern),
    );
  }

  private expandEventOccurrencesForDay(
    event: ParsedIcsEvent,
    dayStart: Date,
    dayEnd: Date,
  ): Array<{ start: Date; end: Date }> {
    if (event.recurrenceId) {
      return [{ start: event.start, end: event.end }];
    }

    if (!event.recurrenceRule) {
      return [{ start: event.start, end: event.end }];
    }

    const recurrenceRule = this.parseRecurrenceRule(event.recurrenceRule);
    if (!recurrenceRule || recurrenceRule.frequency !== "DAILY") {
      return [{ start: event.start, end: event.end }];
    }

    const interval = recurrenceRule.interval ?? 1;
    if (interval <= 0) {
      return [{ start: event.start, end: event.end }];
    }

    const eventDuration = event.end.getTime() - event.start.getTime();
    const eventDayStart = new Date(
      event.start.getFullYear(),
      event.start.getMonth(),
      event.start.getDate(),
      0,
      0,
      0,
      0,
    );
    const targetDayStart = new Date(
      dayStart.getFullYear(),
      dayStart.getMonth(),
      dayStart.getDate(),
      0,
      0,
      0,
      0,
    );
    const dayDifference = Math.round(
      (targetDayStart.getTime() - eventDayStart.getTime()) /
        (24 * 60 * 60 * 1000),
    );

    if (dayDifference < 0 || dayDifference % interval !== 0) {
      return [];
    }

    const occurrenceStart = new Date(
      event.start.getTime() + dayDifference * 24 * 60 * 60 * 1000,
    );
    const occurrenceEnd = new Date(occurrenceStart.getTime() + eventDuration);
    const occurrenceKey = this.formatDateKey(occurrenceStart);
    const isExcluded = event.exceptionDates.some(
      (exceptionDate) => this.formatDateKey(exceptionDate) === occurrenceKey,
    );

    if (isExcluded) {
      return [];
    }

    if (recurrenceRule.until && occurrenceStart > recurrenceRule.until) {
      return [];
    }

    if (occurrenceEnd <= dayStart || occurrenceStart >= dayEnd) {
      return [];
    }

    return [{ start: occurrenceStart, end: occurrenceEnd }];
  }

  private parseRecurrenceRule(
    recurrenceRule: string,
  ): { frequency: string; interval?: number; until?: Date } | null {
    const segments = recurrenceRule.split(";");
    const parsedRule = new Map<string, string>();

    for (const segment of segments) {
      const [key, value] = segment.split("=");
      if (!key || !value) {
        continue;
      }

      parsedRule.set(key.toUpperCase(), value);
    }

    const frequency = parsedRule.get("FREQ");
    if (!frequency) {
      return null;
    }

    return {
      frequency,
      interval: parsedRule.get("INTERVAL")
        ? Number(parsedRule.get("INTERVAL"))
        : undefined,
      until: parsedRule.get("UNTIL")
        ? (this.parseIcsDateValue(parsedRule.get("UNTIL") ?? "", new Map()) ??
          undefined)
        : undefined,
    };
  }

  private formatDateKey(value: Date): string {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }

  private findHeadingSectionRange(
    lines: string[],
    heading: string,
    headingLevel: number,
  ): { start: number; end: number } | null {
    const normalizedLevel = Math.min(Math.max(Math.floor(headingLevel), 1), 6);
    const headingLine = `${"#".repeat(normalizedLevel)} ${heading}`;
    const headingIndex = lines.findIndex((line) => line.trim() === headingLine);

    if (headingIndex === -1) {
      return null;
    }

    let sectionEnd = lines.length;
    for (let index = headingIndex + 1; index < lines.length; index += 1) {
      const headingMatch = lines[index].match(/^(#{1,6})\s+/);
      if (!headingMatch) {
        continue;
      }

      const currentHeadingLevel = headingMatch[1].length;
      if (currentHeadingLevel <= normalizedLevel) {
        sectionEnd = index;
        break;
      }
    }

    return {
      start: headingIndex,
      end: sectionEnd,
    };
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
    const sectionRange = this.findHeadingSectionRange(
      lines,
      heading,
      headingLevel,
    );

    if (!sectionRange) {
      const normalizedLevel = Math.min(
        Math.max(Math.floor(headingLevel), 1),
        6,
      );
      const headingLine = `${"#".repeat(normalizedLevel)} ${heading}`;
      const prefix = trimmedContent.length > 0 ? `${trimmedContent}\n\n` : "";
      return `${prefix}${headingLine}\n${sectionBody}\n`;
    }

    const updatedLines = [
      ...lines.slice(0, sectionRange.start + 1),
      sectionBody,
      ...lines.slice(sectionRange.end),
    ];

    return `${updatedLines.join("\n")}\n`;
  }
}

class ExternalSourceSuggestModal extends FuzzySuggestModal<ExternalSourceSelection> {
  sourceType: "note" | "folder";
  onChoose: (selection: ExternalSourceSelection) => void | Promise<void>;

  constructor(
    app: App,
    sourceType: "note" | "folder",
    onChoose: (selection: ExternalSourceSelection) => void | Promise<void>,
  ) {
    super(app);
    this.sourceType = sourceType;
    this.onChoose = onChoose;
    this.setPlaceholder(
      sourceType === "note" ? "Select a Markdown note" : "Select a folder",
    );
  }

  getItems(): ExternalSourceSelection[] {
    if (this.sourceType === "note") {
      return this.app.vault
        .getMarkdownFiles()
        .sort((leftFile, rightFile) =>
          leftFile.path.localeCompare(rightFile.path),
        );
    }

    return this.app.vault
      .getAllLoadedFiles()
      .filter((file): file is TFolder => file instanceof TFolder)
      .sort((leftFolder, rightFolder) =>
        leftFolder.path.localeCompare(rightFolder.path),
      );
  }

  getItemText(item: ExternalSourceSelection): string {
    return item.path;
  }

  async onChooseItem(item: ExternalSourceSelection): Promise<void> {
    await this.onChoose(item);
  }
}

class CalendarPreviewModal extends Modal {
  previewData: CalendarPreviewData;

  constructor(app: App, previewData: CalendarPreviewData) {
    super(app);
    this.previewData = previewData;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    const formattedDate = this.previewData.planningDate.toLocaleDateString();
    contentEl.createEl("h2", {
      text: `Busy calendar preview for ${formattedDate}`,
    });

    contentEl.createEl("p", {
      text: `Loaded ${this.previewData.loadedCalendarCount} remote calendar${this.previewData.loadedCalendarCount === 1 ? "" : "s"}. Failed to load ${this.previewData.failedCalendarCount}.`,
    });

    if (this.previewData.matchedEvents.length === 0) {
      contentEl.createEl("p", {
        text: "No busy calendar events were visible for this day.",
      });
      return;
    }

    const listEl = contentEl.createEl("ul");
    for (const busyRange of this.previewData.matchedEvents) {
      listEl.createEl("li", {
        text: `${this.formatMinutesAsTime(busyRange.startMinutes)}-${this.formatMinutesAsTime(busyRange.endMinutes)} ${busyRange.summary || "Untitled event"}`,
      });
    }
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }

  private formatMinutesAsTime(totalMinutes: number): string {
    const normalizedMinutes = ((totalMinutes % 1440) + 1440) % 1440;
    const hours = Math.floor(normalizedMinutes / 60);
    const minutes = normalizedMinutes % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
  }
}

class DataviewDiagnosticsModal extends Modal {
  planningDate: Date;
  diagnosticsText: string;

  constructor(app: App, planningDate: Date, diagnosticsText: string) {
    super(app);
    this.planningDate = planningDate;
    this.diagnosticsText = diagnosticsText;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", {
      text: `Dataview discovery diagnostics for ${this.planningDate.toLocaleDateString()}`,
    });

    const preEl = contentEl.createEl("pre");
    preEl.setText(this.diagnosticsText);
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}

class DebugLogModal extends Modal {
  logText: string;

  constructor(app: App, logText: string) {
    super(app);
    this.logText = logText;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", {
      text: "Automatic Time Blocking debug log",
    });

    const actionsEl = contentEl.createDiv();
    const copyButton = actionsEl.createEl("button", {
      text: "Copy log",
    });
    copyButton.addEventListener("click", async () => {
      await navigator.clipboard.writeText(this.logText);
      new Notice("Copied debug log.");
    });

    const preEl = contentEl.createEl("pre");
    preEl.setText(this.logText);
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
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
    const usesBuiltInDiscovery =
      this.plugin.settings.externalTaskDiscoveryMode === "built-in";

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
      .setName("Automatic start mode")
      .setDesc(
        "Choose whether automatic scheduling starts at the current time exactly or at the next snapped interval boundary.",
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("snapped", "Nearest snapped time")
          .addOption("now", "Current time")
          .setValue(this.plugin.settings.automaticStartMode)
          .onChange(async (value: AutomaticStartMode) => {
            this.plugin.settings.automaticStartMode = value;
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
        "Earliest automatic scheduling time in HH:MM 24-hour format. Automatic scheduling starts no earlier than this setting.",
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
      .setName("Work day end time")
      .setDesc(
        "Latest allowed end time for generated blocks in HH:MM 24-hour format. Tasks that would run past this time are skipped.",
      )
      .addText((text) =>
        text
          .setPlaceholder("17:00")
          .setValue(this.plugin.settings.workDayEndTime)
          .onChange(async (value) => {
            this.plugin.settings.workDayEndTime =
              value.trim() || DEFAULT_SETTINGS.workDayEndTime;
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

    new Setting(containerEl)
      .setName("Start interval")
      .setDesc(
        "Minute boundary used when placing each generated block. For example, 15 means blocks start on :00, :15, :30, or :45.",
      )
      .addText((text) =>
        text
          .setPlaceholder("15")
          .setValue(String(this.plugin.settings.startIntervalMinutes))
          .onChange(async (value) => {
            const parsedValue = Number(value);
            this.plugin.settings.startIntervalMinutes =
              Number.isFinite(parsedValue) && parsedValue > 0
                ? parsedValue
                : DEFAULT_SETTINGS.startIntervalMinutes;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Split tasks across gaps")
      .setDesc(
        "Allow automatic scheduling to split a task into multiple time blocks when that helps it fit around busy time and existing scheduled blocks.",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.splitTasksAcrossGaps)
          .onChange(async (value) => {
            this.plugin.settings.splitTasksAcrossGaps = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Break between time blocks")
      .setDesc(
        "Minutes of buffer to reserve after each generated time block before the next generated block can begin.",
      )
      .addText((text) =>
        text
          .setPlaceholder("0")
          .setValue(String(this.plugin.settings.breakDurationMinutes))
          .onChange(async (value) => {
            const parsedValue = Number(value);
            this.plugin.settings.breakDurationMinutes =
              Number.isFinite(parsedValue) && parsedValue >= 0
                ? parsedValue
                : DEFAULT_SETTINGS.breakDurationMinutes;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Meeting buffer before busy events")
      .setDesc(
        "Minutes of buffer to reserve before each remote calendar busy event when scheduling generated blocks.",
      )
      .addText((text) =>
        text
          .setPlaceholder("0")
          .setValue(String(this.plugin.settings.meetingBufferBeforeMinutes))
          .onChange(async (value) => {
            const parsedValue = Number(value);
            this.plugin.settings.meetingBufferBeforeMinutes =
              Number.isFinite(parsedValue) && parsedValue >= 0
                ? parsedValue
                : DEFAULT_SETTINGS.meetingBufferBeforeMinutes;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Meeting buffer after busy events")
      .setDesc(
        "Minutes of buffer to reserve after each remote calendar busy event when scheduling generated blocks.",
      )
      .addText((text) =>
        text
          .setPlaceholder("0")
          .setValue(String(this.plugin.settings.meetingBufferAfterMinutes))
          .onChange(async (value) => {
            const parsedValue = Number(value);
            this.plugin.settings.meetingBufferAfterMinutes =
              Number.isFinite(parsedValue) && parsedValue >= 0
                ? parsedValue
                : DEFAULT_SETTINGS.meetingBufferAfterMinutes;
            await this.plugin.saveSettings();
          }),
      );

    containerEl.createEl("h3", { text: "Task discovery" });

    new Setting(containerEl)
      .setName("Task discovery mode")
      .setDesc(
        "Choose whether external tasks are discovered through the plugin's built-in scoped note and folder list or through Dataview. Dataview mode ignores the built-in source list and uses Dataview's indexed task discovery instead.",
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("built-in", "Built-in")
          .addOption("dataview", "Dataview")
          .setValue(this.plugin.settings.externalTaskDiscoveryMode)
          .onChange(async (value: ExternalTaskDiscoveryMode) => {
            this.plugin.settings.externalTaskDiscoveryMode = value;
            await this.plugin.saveSettings();
            this.display();
          }),
      );

    if (usesBuiltInDiscovery) {
      new Setting(containerEl)
        .setName("External task source notes")
        .setDesc(
          "Optional. Pick one or more Markdown notes to pull dated open tasks from outside the active planning note. External tasks are included only when they carry a planning-date marker such as 📅 2026-03-16, ⏳ 2026-03-16, or >2026-03-16.",
        );

      if (this.plugin.settings.externalTaskNotePaths.length === 0) {
        containerEl.createEl("p", {
          text: "No external source notes selected yet.",
        });
      }

      this.plugin.settings.externalTaskNotePaths.forEach((notePath, index) => {
        new Setting(containerEl)
          .setName(`Source note ${index + 1}`)
          .setDesc(notePath)
          .addButton((button) =>
            button.setButtonText("Change").onClick(() => {
              new ExternalSourceSuggestModal(
                this.app,
                "note",
                async (selection) => {
                  if (!(selection instanceof TFile)) {
                    return;
                  }

                  this.plugin.settings.externalTaskNotePaths[index] =
                    selection.path;
                  await this.plugin.saveSettings();
                  this.display();
                },
              ).open();
            }),
          )
          .addExtraButton((button) =>
            button
              .setIcon("trash")
              .setTooltip("Remove source note")
              .onClick(async () => {
                this.plugin.settings.externalTaskNotePaths.splice(index, 1);
                await this.plugin.saveSettings();
                this.display();
              }),
          );
      });

      new Setting(containerEl)
        .setName("Add external source note")
        .setDesc(
          "Pick another Markdown note to include as an external task source.",
        )
        .addButton((button) =>
          button.setButtonText("Add note").onClick(() => {
            new ExternalSourceSuggestModal(
              this.app,
              "note",
              async (selection) => {
                if (!(selection instanceof TFile)) {
                  return;
                }

                if (
                  !this.plugin.settings.externalTaskNotePaths.includes(
                    selection.path,
                  )
                ) {
                  this.plugin.settings.externalTaskNotePaths.push(
                    selection.path,
                  );
                  await this.plugin.saveSettings();
                }

                this.display();
              },
            ).open();
          }),
        );

      new Setting(containerEl)
        .setName("External task source folders")
        .setDesc(
          "Optional. Pick one or more folders as an external task source scope when tasks are stored across multiple notes. Automatic Time Blocking will read Markdown notes inside these folders instead of scanning the whole vault.",
        );

      if (this.plugin.settings.externalTaskFolderPaths.length === 0) {
        containerEl.createEl("p", {
          text: "No external source folders selected yet.",
        });
      }

      this.plugin.settings.externalTaskFolderPaths.forEach(
        (folderPath, index) => {
          new Setting(containerEl)
            .setName(`Source folder ${index + 1}`)
            .setDesc(folderPath)
            .addButton((button) =>
              button.setButtonText("Change").onClick(() => {
                new ExternalSourceSuggestModal(
                  this.app,
                  "folder",
                  async (selection) => {
                    if (!(selection instanceof TFolder)) {
                      return;
                    }

                    this.plugin.settings.externalTaskFolderPaths[index] =
                      selection.path;
                    await this.plugin.saveSettings();
                    this.display();
                  },
                ).open();
              }),
            )
            .addExtraButton((button) =>
              button
                .setIcon("trash")
                .setTooltip("Remove source folder")
                .onClick(async () => {
                  this.plugin.settings.externalTaskFolderPaths.splice(index, 1);
                  await this.plugin.saveSettings();
                  this.display();
                }),
            );
        },
      );

      new Setting(containerEl)
        .setName("Add external source folder")
        .setDesc(
          "Pick another folder to include as an external task source scope.",
        )
        .addButton((button) =>
          button.setButtonText("Add folder").onClick(() => {
            new ExternalSourceSuggestModal(
              this.app,
              "folder",
              async (selection) => {
                if (!(selection instanceof TFolder)) {
                  return;
                }

                if (
                  !this.plugin.settings.externalTaskFolderPaths.includes(
                    selection.path,
                  )
                ) {
                  this.plugin.settings.externalTaskFolderPaths.push(
                    selection.path,
                  );
                  await this.plugin.saveSettings();
                }

                this.display();
              },
            ).open();
          }),
        );
    } else {
      new Setting(containerEl)
        .setName("Dataview discovery")
        .setDesc(
          "Dataview mode is active. Automatic Time Blocking will use Dataview's indexed task discovery for external tasks and ignore the built-in file and folder source list while this mode is selected.",
        );
    }

    new Setting(containerEl)
      .setName("Debug log")
      .setDesc(
        "Open the in-plugin debug log for recent Dataview discovery diagnostics and related debug output.",
      )
      .addButton((button) =>
        button.setButtonText("Open log").onClick(() => {
          this.plugin.openDebugLog();
        }),
      )
      .addButton((button) =>
        button.setButtonText("Clear log").onClick(() => {
          this.plugin.clearDebugLog();
          this.plugin.openDebugLog();
        }),
      );

    new Setting(containerEl)
      .setName("Remote calendars")
      .setDesc(
        "Optional. Add one or more internet calendars. Automatic Time Blocking will avoid placing generated tasks during matching calendar events for the day being planned.",
      )
      .setClass("atb-remote-calendars");

    if (this.plugin.settings.remoteCalendarUrls.length === 0) {
      containerEl.createEl("p", {
        text: "No remote calendars added yet.",
      });
    }

    this.plugin.settings.remoteCalendarUrls.forEach((calendarUrl, index) => {
      new Setting(containerEl)
        .setName(`Remote calendar ${index + 1}`)
        .setDesc(
          "Paste an internet calendar ICS URL. The link should end with .ics for the best results.",
        )
        .addText((text) =>
          text
            .setPlaceholder("https://example.com/calendar.ics")
            .setValue(calendarUrl)
            .onChange(async (value) => {
              this.plugin.settings.remoteCalendarUrls[index] =
                this.plugin.normalizeRemoteCalendarUrl(value);
              await this.plugin.saveSettings();
            }),
        )
        .addExtraButton((button) =>
          button
            .setIcon("trash")
            .setTooltip("Remove remote calendar")
            .onClick(async () => {
              this.plugin.settings.remoteCalendarUrls.splice(index, 1);
              await this.plugin.saveSettings();
              this.display();
            }),
        );
    });

    new Setting(containerEl)
      .setName("Add remote calendar")
      .setDesc("Add another internet calendar feed.")
      .addButton((button) =>
        button.setButtonText("Add remote calendar").onClick(async () => {
          this.plugin.settings.remoteCalendarUrls.push("");
          await this.plugin.saveSettings();
          this.display();
        }),
      );

    new Setting(containerEl)
      .setName("Calendar sync actions")
      .setDesc(
        "Refresh configured remote calendars and preview the busy calendar events visible to Automatic Time Blocking for the active note date.",
      )
      .addButton((button) =>
        button.setButtonText("Refresh now").onClick(async () => {
          await this.plugin.refreshBusyCalendarsForActiveNote();
        }),
      )
      .addButton((button) =>
        button.setButtonText("Preview active note").onClick(async () => {
          await this.plugin.previewBusyCalendarsForActiveNote();
        }),
      );

    new Setting(containerEl)
      .setName("Ignored calendar event patterns")
      .setDesc(
        "Optional. Add one case-insensitive event-title match per line. Matching calendar events are ignored when Automatic Time Blocking computes busy time. This is useful for recurring events you do not want to block around.",
      )
      .addTextArea((textArea) => {
        textArea
          .setPlaceholder("Focus time")
          .setValue(this.plugin.settings.ignoredCalendarEventPatterns)
          .onChange(async (value) => {
            this.plugin.settings.ignoredCalendarEventPatterns = value;
            await this.plugin.saveSettings();
          });

        textArea.inputEl.rows = 4;
        textArea.inputEl.cols = 40;
      });
  }
}
