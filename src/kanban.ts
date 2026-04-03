export interface KanbanBoardSetting {
  boardPath: string;
  activeColumnNames: string[];
  doneColumnName: string;
  reopenColumnName: string;
}

export interface ResolvedKanbanBoardSetting extends KanbanBoardSetting {
  activeColumnNames: string[];
  doneColumnName: string;
  reopenColumnName: string;
}

export interface ParsedKanbanBoardColumn {
  name: string;
  normalizedName: string;
  headingLineIndex: number;
  endLineIndexExclusive: number;
}

export interface ParsedKanbanCard {
  text: string;
  fingerprint: string;
  rawLine: string;
  lineIndex: number;
  columnName: string;
  normalizedColumnName: string;
  checkboxStatus: string | null;
}

export interface ParsedKanbanBoard {
  columns: ParsedKanbanBoardColumn[];
  cards: ParsedKanbanCard[];
}

export interface KanbanCardMoveRequest {
  sourceFingerprint: string;
  targetColumnName: string;
  status: "active" | "completed";
}

export interface KanbanCardMoveResult {
  moved: boolean;
  previousColumnName: string | null;
  targetColumnName: string | null;
  updatedContent: string;
}

const DEFAULT_ACTIVE_COLUMN_ALIASES = [
  "open",
  "active",
  "doing",
  "in progress",
  "current",
  "working",
  "review",
  "in review",
];

const DEFAULT_DONE_COLUMN_ALIASES = [
  "done",
  "complete",
  "completed",
  "closed",
  "shipped",
];

export function normalizeKanbanColumnName(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

export function splitKanbanColumnNames(value: string): string[] {
  const seenNames = new Set<string>();
  const normalizedNames: string[] = [];

  for (const part of value.split(",")) {
    const normalizedPart = normalizeKanbanColumnName(part);
    if (normalizedPart.length === 0 || seenNames.has(normalizedPart)) {
      continue;
    }

    seenNames.add(normalizedPart);
    normalizedNames.push(normalizedPart);
  }

  return normalizedNames;
}

export function inferKanbanActiveColumns(columnNames: string[]): string[] {
  const availableColumns = new Set(
    columnNames.map((columnName) => normalizeKanbanColumnName(columnName)),
  );

  return DEFAULT_ACTIVE_COLUMN_ALIASES.filter((alias) =>
    availableColumns.has(alias),
  );
}

export function inferKanbanDoneColumn(columnNames: string[]): string {
  const normalizedColumns = columnNames.map((columnName) =>
    normalizeKanbanColumnName(columnName),
  );

  for (const alias of DEFAULT_DONE_COLUMN_ALIASES) {
    if (normalizedColumns.includes(alias)) {
      return alias;
    }
  }

  return "";
}

export function isKanbanInProgressColumn(columnName: string): boolean {
  const normalizedName = normalizeKanbanColumnName(columnName);
  return (
    normalizedName === "doing" ||
    normalizedName === "in progress" ||
    normalizedName === "current" ||
    normalizedName === "working" ||
    normalizedName === "review" ||
    normalizedName === "in review"
  );
}

export function resolveKanbanBoardSetting(
  columnNames: string[],
  boardSetting: KanbanBoardSetting,
): ResolvedKanbanBoardSetting {
  const normalizedColumnNames = new Set(
    columnNames.map((columnName) => normalizeKanbanColumnName(columnName)),
  );
  const configuredActiveColumns = boardSetting.activeColumnNames.filter(
    (columnName) => normalizedColumnNames.has(columnName),
  );
  const inferredActiveColumns = inferKanbanActiveColumns(columnNames);
  const activeColumnNames =
    configuredActiveColumns.length > 0
      ? configuredActiveColumns
      : inferredActiveColumns;

  const configuredDoneColumn = normalizeKanbanColumnName(
    boardSetting.doneColumnName,
  );
  const doneColumnName =
    configuredDoneColumn.length > 0 &&
    normalizedColumnNames.has(configuredDoneColumn)
      ? configuredDoneColumn
      : inferKanbanDoneColumn(columnNames);

  const configuredReopenColumn = normalizeKanbanColumnName(
    boardSetting.reopenColumnName,
  );
  const reopenColumnName =
    configuredReopenColumn.length > 0 &&
    normalizedColumnNames.has(configuredReopenColumn)
      ? configuredReopenColumn
      : (activeColumnNames[0] ?? "");

  return {
    boardPath: boardSetting.boardPath,
    activeColumnNames,
    doneColumnName,
    reopenColumnName,
  };
}

export function buildKanbanCardFingerprint(
  cardText: string,
  occurrence: number,
): string {
  return `kanban::${normalizeFingerprint(cardText)}::${occurrence}`;
}

export function extractKanbanBoard(content: string): ParsedKanbanBoard {
  const lines = content.split(/\r?\n/);
  const columns: ParsedKanbanBoardColumn[] = [];
  const cards: ParsedKanbanCard[] = [];
  const occurrencesByText = new Map<string, number>();
  let currentColumn: ParsedKanbanBoardColumn | null = null;
  let insideCodeFence = false;
  let insideFrontmatter = false;
  let boardEndLineIndex = lines.length;

  for (const [index, line] of lines.entries()) {
    const trimmedLine = line.trim();

    if (index === 0 && trimmedLine === "---") {
      insideFrontmatter = true;
      continue;
    }

    if (insideFrontmatter) {
      if (trimmedLine === "---") {
        insideFrontmatter = false;
      }
      continue;
    }

    if (/^```/.test(trimmedLine)) {
      insideCodeFence = !insideCodeFence;
      continue;
    }

    if (insideCodeFence) {
      continue;
    }

    if (/^%%\s*kanban:settings\s*$/.test(trimmedLine)) {
      currentColumn = null;
      boardEndLineIndex = index;
      continue;
    }

    const headingMatch = line.match(/^##\s+(.+?)\s*$/);
    if (headingMatch) {
      currentColumn = {
        name: headingMatch[1].trim(),
        normalizedName: normalizeKanbanColumnName(headingMatch[1]),
        headingLineIndex: index,
        endLineIndexExclusive: lines.length,
      };
      columns.push(currentColumn);
      continue;
    }

    if (!currentColumn) {
      continue;
    }

    const cardMatch = line.match(/^\s*[-*]\s+(.*)$/);
    if (!cardMatch) {
      continue;
    }

    const cardText = cleanKanbanCardText(cardMatch[1]);
    if (cardText.length === 0) {
      continue;
    }

    const occurrence =
      (occurrencesByText.get(normalizeFingerprint(cardText)) ?? 0) + 1;
    occurrencesByText.set(normalizeFingerprint(cardText), occurrence);

    cards.push({
      text: cardText,
      fingerprint: buildKanbanCardFingerprint(cardText, occurrence),
      rawLine: line,
      lineIndex: index,
      columnName: currentColumn.name,
      normalizedColumnName: currentColumn.normalizedName,
      checkboxStatus: extractCheckboxStatus(cardMatch[1]),
    });
  }

  for (let index = 0; index < columns.length; index += 1) {
    columns[index].endLineIndexExclusive =
      columns[index + 1]?.headingLineIndex ?? boardEndLineIndex;
  }

  return { columns, cards };
}

export function moveKanbanCardInBoard(
  content: string,
  request: KanbanCardMoveRequest,
): KanbanCardMoveResult {
  const board = extractKanbanBoard(content);
  const targetColumnName = normalizeKanbanColumnName(request.targetColumnName);
  const targetColumn = board.columns.find(
    (column) => column.normalizedName === targetColumnName,
  );
  const card = board.cards.find(
    (boardCard) => boardCard.fingerprint === request.sourceFingerprint,
  );

  if (!targetColumn || !card) {
    return {
      moved: false,
      previousColumnName: card?.columnName ?? null,
      targetColumnName: targetColumn?.name ?? null,
      updatedContent: content,
    };
  }

  const updatedCardLine = updateKanbanCardLineStatus(
    card.rawLine,
    request.status,
  );
  if (
    card.normalizedColumnName === targetColumn.normalizedName &&
    updatedCardLine === card.rawLine
  ) {
    return {
      moved: false,
      previousColumnName: card.columnName,
      targetColumnName: targetColumn.name,
      updatedContent: content,
    };
  }

  const lines = content.split(/\r?\n/);
  lines.splice(card.lineIndex, 1);

  let insertIndex = targetColumn.endLineIndexExclusive;
  if (card.lineIndex < insertIndex) {
    insertIndex -= 1;
  }

  while (
    insertIndex > targetColumn.headingLineIndex + 1 &&
    lines[insertIndex - 1]?.trim().length === 0
  ) {
    insertIndex -= 1;
  }

  lines.splice(insertIndex, 0, updatedCardLine);

  return {
    moved: true,
    previousColumnName: card.columnName,
    targetColumnName: targetColumn.name,
    updatedContent: lines.join("\n"),
  };
}

function extractCheckboxStatus(rawText: string): string | null {
  const taskMatch = rawText.match(/^\[([^\]])\]\s+/);
  return taskMatch ? taskMatch[1] : null;
}

function cleanKanbanCardText(rawText: string): string {
  const withoutCheckbox = rawText.replace(/^\[([^\]])\]\s+/, "");
  return withoutCheckbox
    .replace(/^\d{1,2}:\d{2}-\d{1,2}:\d{2}\s+/, "")
    .replace(/(^|\s)(\d{1,2}:\d{2})(?=\s|$)/, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function updateKanbanCardLineStatus(
  originalLine: string,
  status: "active" | "completed",
): string {
  if (!/^\s*[-*]\s+\[[^\]]\]\s+/.test(originalLine)) {
    return originalLine;
  }

  if (status === "completed") {
    return originalLine.replace(
      /^(\s*[-*]\s+)\[(?: |\/|>)\](\s+.*)$/,
      "$1[x]$2",
    );
  }

  return originalLine.replace(/^(\s*[-*]\s+)\[x\](\s+.*)$/i, "$1[ ]$2");
}

function normalizeFingerprint(value: string): string {
  return value
    .replace(/<!--[^>]*-->/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
