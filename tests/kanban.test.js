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

function readFixture(name) {
  return fs.readFileSync(path.join(fixturesDir, name), "utf8");
}

test("extractKanbanBoard parses columns and cards", () => {
  const content = readFixture("kanban-board-default.md");
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
  const resolved = resolveKanbanBoardSetting(["Backlog", "Doing", "Shipped"], {
    boardPath: "Projects/Board.md",
    activeColumnNames: ["doing"],
    doneColumnName: "shipped",
    reopenColumnName: "doing",
  });

  assert.deepEqual(resolved.activeColumnNames, ["doing"]);
  assert.equal(resolved.doneColumnName, "shipped");
  assert.equal(resolved.reopenColumnName, "doing");
});

test("moveKanbanCardInBoard moves cards between columns and updates checkbox status", () => {
  const content = readFixture("kanban-board-default.md");
  const board = extractKanbanBoard(content);
  const targetCard = board.cards.find(
    (card) => card.text === "Ship Kanban sync",
  );

  assert.ok(targetCard, "expected fixture card to exist");

  const completedResult = moveKanbanCardInBoard(content, {
    sourceFingerprint: targetCard.fingerprint,
    targetColumnName: "Done",
    status: "completed",
  });

  assert.equal(completedResult.moved, true);
  const completedBoard = extractKanbanBoard(completedResult.updatedContent);
  const completedCard = completedBoard.cards.find(
    (card) => card.fingerprint === targetCard.fingerprint,
  );

  assert.ok(completedCard, "expected moved card to remain parseable");
  assert.equal(completedCard.columnName, "Done");
  assert.equal(completedCard.checkboxStatus, "x");

  const reopenedResult = moveKanbanCardInBoard(completedResult.updatedContent, {
    sourceFingerprint: targetCard.fingerprint,
    targetColumnName: "In Progress",
    status: "active",
  });

  assert.equal(reopenedResult.moved, true);
  const reopenedBoard = extractKanbanBoard(reopenedResult.updatedContent);
  const reopenedCard = reopenedBoard.cards.find(
    (card) => card.fingerprint === targetCard.fingerprint,
  );

  assert.ok(reopenedCard, "expected reopened card to remain parseable");
  assert.equal(reopenedCard.columnName, "In Progress");
  assert.equal(reopenedCard.checkboxStatus, " ");
});

test("moveKanbanCardInBoard keeps moved cards above the kanban settings footer", () => {
  const content = readFixture("kanban-board-with-settings-footer.md");
  const board = extractKanbanBoard(content);
  const targetCard = board.cards.find(
    (card) => card.text === "Try out kanban 🔺 🛫 2026-04-02",
  );

  assert.ok(targetCard, "expected footer fixture card to exist");

  const completedResult = moveKanbanCardInBoard(content, {
    sourceFingerprint: targetCard.fingerprint,
    targetColumnName: "Done",
    status: "completed",
  });

  assert.equal(completedResult.moved, true);

  const completedBoard = extractKanbanBoard(completedResult.updatedContent);
  const completedCard = completedBoard.cards.find(
    (card) => card.fingerprint === targetCard.fingerprint,
  );

  assert.ok(
    completedCard,
    "expected moved footer-fixture card to remain parseable",
  );
  assert.equal(completedCard.columnName, "Done");
  assert.equal(completedCard.checkboxStatus, "x");
  assert.ok(
    completedResult.updatedContent.indexOf(
      "- [x] Try out kanban 🔺 🛫 2026-04-02",
    ) < completedResult.updatedContent.indexOf("%% kanban:settings"),
    "expected moved card to stay above the kanban settings footer",
  );
});
