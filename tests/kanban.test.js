const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  extractKanbanBoard,
  inferKanbanActiveColumns,
  inferKanbanDoneColumn,
  moveKanbanCardInBoard,
  resolveKanbanBoardSetting,
} = require("../.tmp-tests/src/kanban.js");

const fixturesDir = path.join(__dirname, "fixtures");

test("extractKanbanBoard parses columns and cards", () => {
  const content = fs.readFileSync(
    path.join(fixturesDir, "kanban-board-default.md"),
    "utf8",
  );
  const board = extractKanbanBoard(content);

  assert.deepEqual(
    board.columns.map((column) => column.name),
    ["Ideas", "Todo", "In Progress", "Done"],
  );
  assert.deepEqual(
    board.cards.map((card) => card.text),
    [
      "Explore someday idea",
      "Tidy docs",
      "Ship Kanban sync",
      "Review defaults",
      "Already shipped",
    ],
  );
});

test("default inference excludes backlog-style columns from active planning", () => {
  const columns = ["Ideas", "Todo", "In Progress", "Done"];

  assert.deepEqual(inferKanbanActiveColumns(columns), ["in progress"]);
  assert.equal(inferKanbanDoneColumn(columns), "done");
});

test("resolveKanbanBoardSetting honors per-board overrides", () => {
  const resolved = resolveKanbanBoardSetting(
    ["Backlog", "Doing", "Shipped"],
    {
      boardPath: "Projects/Board.md",
      activeColumnNames: ["doing"],
      doneColumnName: "shipped",
      reopenColumnName: "doing",
    },
  );

  assert.deepEqual(resolved.activeColumnNames, ["doing"]);
  assert.equal(resolved.doneColumnName, "shipped");
  assert.equal(resolved.reopenColumnName, "doing");
});

test("moveKanbanCardInBoard moves cards between columns and updates checkbox status", () => {
  const content = fs.readFileSync(
    path.join(fixturesDir, "kanban-board-default.md"),
    "utf8",
  );
  const board = extractKanbanBoard(content);
  const targetCard = board.cards.find((card) => card.text === "Ship Kanban sync");

  assert.ok(targetCard, "expected fixture card to exist");

  const completedResult = moveKanbanCardInBoard(content, {
    sourceFingerprint: targetCard.fingerprint,
    targetColumnName: "Done",
    status: "completed",
  });

  assert.equal(completedResult.moved, true);
  assert.match(
    completedResult.updatedContent,
    /## Done[\s\S]*- \[x\] Ship Kanban sync/,
  );

  const reopenedResult = moveKanbanCardInBoard(completedResult.updatedContent, {
    sourceFingerprint: targetCard.fingerprint,
    targetColumnName: "In Progress",
    status: "active",
  });

  assert.equal(reopenedResult.moved, true);
  assert.match(
    reopenedResult.updatedContent,
    /## In Progress[\s\S]*- \[ \] Ship Kanban sync/,
  );
});
