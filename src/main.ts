import {
  App,
  MarkdownView,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  requestUrl,
  Setting,
} from "obsidian";
import moment from "moment";
import { tz } from "moment-timezone";
import * as ical from "node-ical";

type TaskPriority = "highest" | "high" | "medium" | "none" | "low" | "lowest";

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
  remoteCalendarUrls: string[];
  ignoredCalendarEventPatterns: string;
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
  remoteCalendarUrls: [],
  ignoredCalendarEventPatterns: "",
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
  statusMarker: " " | "/" | ">";
  indent: number;
  subtasks: ParsedTask[];
}

interface ParsedTaskTimeRange {
  startMinutes: number;
  endMinutes: number;
  durationMinutes: number;
}

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

export default class ObsidianAutomaticTimeBlocking extends Plugin {
  settings: ObsidianAutomaticTimeBlockingSettings;
  calendarPreviewCache = new Map<string, CalendarPreviewData>();

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

    this.addSettingTab(new AutomaticTimeBlockingSettingTab(this.app, this));
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

  private async generateTimeBlocksForActiveNote() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.file) {
      new Notice("Open a Markdown note to generate time blocks.");
      return;
    }

    const content = await this.app.vault.cachedRead(view.file);
    const tasks = this.extractOpenTasks(content);
    const planningDate = this.resolvePlanningDate(view.file.basename);

    if (tasks.length === 0) {
      new Notice("No open or in-progress tasks found in the active note.");
      return;
    }

    const { busyRanges, failedCalendarCount } =
      await this.getCalendarPreviewData(planningDate, false);
    const generatedTimeBlocks = this.buildTimeBlockLines(tasks, busyRanges);

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

    new Notice(
      `Generated ${generatedCount} time block${generatedCount === 1 ? "" : "s"}.${skippedSuffix}${calendarSuffix}`,
    );
  }

  private extractOpenTasks(content: string): ParsedTask[] {
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

      const taskMatch = line.match(/^\s*[-*]\s+\[( |\/|>)\]\s+(.*)$/);
      if (!taskMatch) {
        continue;
      }

      const indentMatch = line.match(/^(\s*)[-*]\s+\[( |\/|>)\]\s+/);
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
        statusMarker: taskMatch[1] as " " | "/" | ">",
        indent: indentMatch?.[1].length ?? 0,
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

    return tasks.sort(
      (leftTask, rightTask) =>
        this.getTaskPriorityRank(rightTask.priority) -
        this.getTaskPriorityRank(leftTask.priority),
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

  private buildTimeBlockLines(
    tasks: ParsedTask[],
    busyRanges: TimeRange[],
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
    let currentAutomaticStartMinutes = this.getInitialStartMinutes();
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

        scheduledLines.push(`- [${task.statusMarker}] ${prefix}${task.text}`);
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
    const renderedLines = [
      `${indentation}- [${task.statusMarker}] ${prefix}${task.text}`,
    ];

    for (const subtask of task.subtasks) {
      renderedLines.push(
        ...this.buildRenderedTaskLines(subtask, "", depth + 1),
      );
    }

    return renderedLines;
  }

  private getInitialStartMinutes(): number {
    const configuredStartMinutes = this.parseTimeToMinutes(
      this.settings.dayStartTime,
    );
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

      nextStartMinutes = this.snapMinutesToInterval(
        overlappingRange.endMinutes,
      );
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
        nextStartMinutes = this.snapMinutesToInterval(
          containingRange.endMinutes,
        );
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

  normalizeRemoteCalendarUrl(value: string): string {
    return value.trim().replace(/^webcal:\/\//i, "https://");
  }

  private getCalendarCacheKey(planningDate: Date): string {
    return [
      this.formatDateKey(planningDate),
      this.settings.remoteCalendarUrls.join("\n"),
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
        const extractionResult = this.extractBusyRangesFromIcs(
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

  private extractBusyRangesFromIcs(
    rawCalendar: string,
    planningDate: Date,
  ): {
    busyRanges: CalendarBusyRange[];
    eventDiagnostics: CalendarEventDiagnostic[];
  } {
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
    const calendarEntries = Object.values(
      ical.sync.parseICS(rawCalendar) as Record<string, any>,
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
          this.nodeIcalHasExcludedOccurrence(calendarEntry, occurrenceStart)
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

      const occurrenceMoment = moment(occurrenceStart);
      const utcOffset = occurrenceMoment.utcOffset();
      const occurrenceDateWithoutOffset = occurrenceMoment
        .clone()
        .subtract(utcOffset, "minutes");

      return moment(exceptionDate).isSame(occurrenceDateWithoutOffset, "day");
    });
  }

  private adjustNodeIcalOccurrenceStart(
    calendarEntry: any,
    occurrenceStart: Date,
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
    );
    adjustedMoment = this.adjustForOtherZones(tzid, adjustedMoment.toDate());
    return adjustedMoment.toDate();
  }

  private adjustForOtherZones(tzid: string, currentDate: Date) {
    const localTzid = tz.guess();

    if (tzid === localTzid) {
      return moment(currentDate);
    }

    const localTimezone = tz.zone(localTzid);
    const originalTimezone = tz.zone(tzid);

    if (!localTimezone || !originalTimezone) {
      return moment(currentDate);
    }

    const offset =
      localTimezone.utcOffset(currentDate.getTime()) -
      originalTimezone.utcOffset(currentDate.getTime());

    return moment(currentDate).add(offset, "minutes");
  }

  private adjustForDst(tzid: string, originalDate: Date, currentDate: Date) {
    const timezone = tz.zone(tzid);

    if (!timezone) {
      return moment(currentDate);
    }

    const offset =
      timezone.utcOffset(currentDate.getTime()) -
      timezone.utcOffset(originalDate.getTime());

    return moment(currentDate).add(offset, "minutes");
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
    const sortedRanges = ranges
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
