/**
 * Catch Sneaky Cookie — player data backend (Google Apps Script).
 *
 * Paste this whole file into the Apps Script editor of your Google Sheet
 * (Extensions → Apps Script), run setup() once, then deploy as a web app.
 * Full steps: backend/SETUP.md.
 *
 * Owner switch: the "Settings" tab has ONE_PLAY_ONLY.
 *   ticked   → each phone number can play one round only
 *   unticked → unlimited rounds (every round is still logged)
 */

const PLAYERS = "Players";
const PLAYS = "Plays";
const SETTINGS = "Settings";

const PLAYER_HEADERS = ["Registered At", "Name", "Phone", "Email", "Plays", "Best Score", "Last Played At", "Vouchers Won"];
const PLAY_HEADERS = ["Play ID", "Started At", "Name", "Phone", "Cat", "Score", "Result", "Prize", "Finished At"];

// Players columns (1-based)
const P_NAME = 2, P_EMAIL = 4, P_PLAYS = 5, P_BEST = 6, P_LAST_PLAYED = 7, P_VOUCHERS = 8;
// Plays columns (1-based)
const R_SCORE = 6, R_PRIZE = 8;

function setup() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  [[PLAYERS, PLAYER_HEADERS, "C:C"], [PLAYS, PLAY_HEADERS, "D:D"]].forEach(([name, headers, phoneColumn]) => {
    const sheet = book.getSheetByName(name) || book.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");
    sheet.setFrozenRows(1);
    // Keep phone numbers as text so Sheets never reformats them.
    sheet.getRange(phoneColumn).setNumberFormat("@");
  });

  const settings = book.getSheetByName(SETTINGS) || book.insertSheet(SETTINGS);
  if (settings.getLastRow() === 0) {
    settings.getRange(1, 1, 1, 3).setValues([["Setting", "Value", "What it does"]]).setFontWeight("bold");
    settings.getRange(2, 1, 1, 3).setValues([["ONE_PLAY_ONLY", true, "Ticked: each phone number can play once. Unticked: unlimited plays."]]);
    settings.getRange(2, 2).insertCheckboxes();
    settings.setFrozenRows(1);
    settings.autoResizeColumns(1, 3);
  }
}

function doGet() {
  return json({ ok: true, status: "Catch Sneaky Cookie backend is running." });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ ok: false, error: "bad_request" });
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return json({ ok: false, error: "busy" });
  try {
    const handlers = { register, start, score, prize };
    const handler = handlers[body.action];
    return json(handler ? handler(body) : { ok: false, error: "unknown_action" });
  } finally {
    lock.releaseLock();
  }
}

function register(body) {
  const name = clean(body.name, 60);
  const email = clean(body.email, 120).toLowerCase();
  const phone = digits(body.phone);
  if (!name || !/^\d{9,15}$/.test(phone) || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { ok: false, error: "invalid_details" };
  }

  const players = sheet(PLAYERS);
  const found = findPlayer(players, phone);
  const onePlayOnly = isOnePlayOnly();
  if (found && onePlayOnly && Number(found.values[P_PLAYS - 1]) > 0) return playedResponse(phone);

  if (found) {
    players.getRange(found.row, P_NAME).setValue(safe(name));
    players.getRange(found.row, P_EMAIL).setValue(safe(email));
  } else {
    players.appendRow([new Date(), safe(name), phone, safe(email), 0, "", "", ""]);
  }
  return { ok: true, status: "ok", onePlayOnly };
}

function start(body) {
  const phone = digits(body.phone);
  const players = sheet(PLAYERS);
  const found = findPlayer(players, phone);
  if (!found) return { ok: false, error: "not_registered" };

  const onePlayOnly = isOnePlayOnly();
  const plays = Number(found.values[P_PLAYS - 1]) || 0;
  if (onePlayOnly && plays > 0) return playedResponse(phone);

  const now = new Date();
  const playId = Utilities.getUuid();
  players.getRange(found.row, P_PLAYS).setValue(plays + 1);
  players.getRange(found.row, P_LAST_PLAYED).setValue(now);
  sheet(PLAYS).appendRow([playId, now, found.values[P_NAME - 1], phone, safe(clean(body.cat, 30)), "", "", "", ""]);
  return { ok: true, status: "ok", onePlayOnly, playId };
}

function score(body) {
  const plays = sheet(PLAYS);
  const play = findPlay(plays, body.playId);
  if (!play) return { ok: false, error: "unknown_play" };
  // A round's score is written once; later submissions for the same play are ignored.
  if (play.values[R_SCORE - 1] !== "") return { ok: true, status: "ignored" };

  const points = Math.max(0, Math.min(9999, Math.round(Number(body.score) || 0)));
  plays.getRange(play.row, R_SCORE, 1, 2).setValues([[points, clean(body.result, 20)]]);
  plays.getRange(play.row, PLAY_HEADERS.length).setValue(new Date());

  const players = sheet(PLAYERS);
  const found = findPlayer(players, digits(play.values[3]));
  if (found) {
    const best = found.values[P_BEST - 1];
    if (best === "" || points > Number(best)) players.getRange(found.row, P_BEST).setValue(points);
  }
  return { ok: true, status: "ok" };
}

function prize(body) {
  const plays = sheet(PLAYS);
  const play = findPlay(plays, body.playId);
  if (!play) return { ok: false, error: "unknown_play" };
  if (play.values[R_PRIZE - 1] !== "") return { ok: true, status: "ignored" };
  const prizeName = safe(clean(body.prize, 60));
  plays.getRange(play.row, R_PRIZE).setValue(prizeName);

  // Keep a running list on the player's row so every voucher they've won is in one place.
  const players = sheet(PLAYERS);
  const found = findPlayer(players, digits(play.values[3]));
  if (found) {
    const won = String(found.values[P_VOUCHERS - 1] || "");
    players.getRange(found.row, P_VOUCHERS).setValue(won ? `${won}, ${prizeName}` : prizeName);
  }
  return { ok: true, status: "ok" };
}

// Only the score and prize go back, never stored names or emails,
// so typing someone else's number reveals nothing personal.
function playedResponse(phone) {
  const latest = latestPlay(phone);
  return {
    ok: true,
    status: "played",
    score: latest ? Number(latest[R_SCORE - 1]) || 0 : 0,
    prize: latest ? String(latest[R_PRIZE - 1]) : ""
  };
}

function isOnePlayOnly() {
  const settings = sheet(SETTINGS);
  if (!settings) return false;
  const row = settings.getDataRange().getValues().find((values) => values[0] === "ONE_PLAY_ONLY");
  return Boolean(row) && row[1] === true;
}

function findPlayer(players, phone) {
  const rows = rowsOf(players, PLAYER_HEADERS.length);
  const index = rows.findIndex((values) => digits(values[2]) === phone);
  return index < 0 ? null : { row: index + 2, values: rows[index] };
}

function findPlay(plays, playId) {
  const id = clean(playId, 64);
  if (!id) return null;
  const rows = rowsOf(plays, PLAY_HEADERS.length);
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (rows[index][0] === id) return { row: index + 2, values: rows[index] };
  }
  return null;
}

function latestPlay(phone) {
  const rows = rowsOf(sheet(PLAYS), PLAY_HEADERS.length);
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (digits(rows[index][3]) === phone) return rows[index];
  }
  return null;
}

function rowsOf(target, width) {
  const last = target.getLastRow();
  return last < 2 ? [] : target.getRange(2, 1, last - 1, width).getValues();
}

function sheet(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function clean(value, max) {
  return (value == null ? "" : String(value)).trim().slice(0, max);
}

function digits(value) {
  return (value == null ? "" : String(value)).replace(/\D/g, "");
}

// Stop typed text like "=HYPERLINK(...)" from running as a spreadsheet formula.
function safe(text) {
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function json(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
