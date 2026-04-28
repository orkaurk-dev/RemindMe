const STORAGE_KEY = "remindme.items.v3";

const form = document.getElementById("reminderForm");
const submitButton = form.querySelector('button[type="submit"]');
const cancelEditButton = document.getElementById("cancelEditButton");
const titleInput = document.getElementById("titleInput");
const dueInput = document.getElementById("dueInput");
const priorityInput = document.getElementById("priorityInput");
const repeatInput = document.getElementById("repeatInput");
const noteInput = document.getElementById("noteInput");
const list = document.getElementById("reminderList");
const template = document.getElementById("reminderTemplate");
const searchInput = document.getElementById("searchInput");
const filterGroup = document.getElementById("filterGroup");
const clearDoneButton = document.getElementById("clearDoneButton");
const emptyState = document.getElementById("emptyState");
const statusText = document.getElementById("statusText");
const totalCount = document.getElementById("totalCount");
const todayCount = document.getElementById("todayCount");
const doneCount = document.getElementById("doneCount");

let state = loadItems();
let activeFilter = "all";
let search = "";
let notifiedIds = new Set();
let editingId = null;
let highlightedReminderId = null;

window.remindme?.onFocusNewReminder?.(() => {
  cancelEditing();
  titleInput.focus();
});

window.remindme?.onNotificationAction?.((payload) => {
  handleNotificationAction(payload);
});

render();
startReminderPolling();

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const title = titleInput.value.trim();
  if (!title) {
    return;
  }

  const itemData = {
    title,
    note: noteInput.value.trim(),
    due: dueInput.value ? new Date(dueInput.value).toISOString() : "",
    priority: priorityInput.value,
    repeat: repeatInput.value,
    done: false,
    createdAt: new Date().toISOString(),
    notifiedAt: "",
  };

  let savedId = editingId;

  if (editingId) {
    state = state.map((item) => {
      if (item.id !== editingId) {
        return item;
      }

      savedId = item.id;
      return {
        ...item,
        ...itemData,
        id: item.id,
        done: false,
        notifiedAt: "",
      };
    });
  } else {
    savedId = crypto.randomUUID();
    state = [{
      id: savedId,
      ...itemData,
    }, ...state];
  }

  saveItems();
  resetEditorState();
  form.reset();
  priorityInput.value = "medium";
  repeatInput.value = "none";
  highlightedReminderId = savedId;
  render();
});

cancelEditButton.addEventListener("click", () => {
  cancelEditing();
});

searchInput.addEventListener("input", () => {
  search = searchInput.value.trim().toLowerCase();
  render();
});

filterGroup.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-filter]");
  if (!button) {
    return;
  }

  activeFilter = button.dataset.filter;
  [...filterGroup.querySelectorAll("button")].forEach((btn) => {
    btn.classList.toggle("active", btn === button);
  });
  render();
});

clearDoneButton.addEventListener("click", () => {
  state = state.filter((item) => !item.done);
  saveItems();
  render();
});

list.addEventListener("click", (event) => {
  const itemElement = event.target.closest(".reminder");
  if (!itemElement) {
    return;
  }

  const id = itemElement.dataset.id;
  const item = state.find((entry) => entry.id === id);
  if (!item) {
    return;
  }

  if (event.target.closest(".edit")) {
    startEditing(item);
  } else if (event.target.closest(".check")) {
    item.done = !item.done;
    if (!item.done) {
      item.notifiedAt = "";
    }
  } else if (event.target.closest(".delete")) {
    state = state.filter((entry) => entry.id !== id);
    notifiedIds.delete(id);
  } else if (event.target.closest(".snooze")) {
    snoozeReminder(item, 1);
  } else if (event.target.closest(".repeat-now")) {
    completeAndRepeat(item);
  } else {
    return;
  }

  saveItems();
  render();
});

function render() {
  checkForDueReminders();

  const filtered = state.filter(matchesFilter).filter(matchesSearch);
  list.innerHTML = "";

  for (const item of filtered) {
    list.appendChild(renderItem(item));
  }

  if (highlightedReminderId) {
    const highlighted = list.querySelector(`[data-id="${highlightedReminderId}"]`);
    highlighted?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  emptyState.style.display = filtered.length === 0 ? "block" : "none";
  statusText.textContent = buildStatusText(filtered.length, state.length);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);

  totalCount.textContent = String(state.length);
  doneCount.textContent = String(state.filter((item) => item.done).length);
  todayCount.textContent = String(state.filter((item) => {
    if (!item.due) {
      return false;
    }

    const due = new Date(item.due);
    return due >= today && due <= todayEnd;
  }).length);
}

function renderItem(item) {
  const node = template.content.firstElementChild.cloneNode(true);
  node.dataset.id = item.id;
  node.classList.toggle("done", item.done);
  node.classList.toggle("highlight", item.id === highlightedReminderId);

  const title = node.querySelector("h3");
  const meta = node.querySelector(".meta");
  const note = node.querySelector(".note");
  const priority = node.querySelector(".priority");
  const check = node.querySelector(".check");
  const editButton = node.querySelector(".edit");
  const repeatButton = node.querySelector(".repeat-now");

  title.textContent = item.title;
  note.textContent = item.note;
  priority.textContent = item.priority;
  priority.className = `priority ${item.priority}`;
  check.textContent = item.done ? "✓" : "○";
  editButton.textContent = "Edit";

  const metaParts = [];
  metaParts.push(item.due ? formatDue(item.due) : "No due date");
  metaParts.push(item.done ? "Completed" : "Open");
  metaParts.push(repeatLabel(item.repeat));
  meta.textContent = metaParts.join(" · ");

  if (!item.note) {
    note.remove();
  }

  repeatButton.style.display = item.repeat && item.repeat !== "none" ? "inline-flex" : "none";

  return node;
}

function matchesFilter(item) {
  if (activeFilter === "all") return true;
  if (activeFilter === "done") return item.done;
  if (activeFilter === "today") return isDueToday(item);
  if (activeFilter === "upcoming") return !item.done && item.due && !isDueToday(item);
  return true;
}

function matchesSearch(item) {
  if (!search) return true;
  return [item.title, item.note, item.priority, item.repeat].some((value) => value.toLowerCase().includes(search));
}

function isDueToday(item) {
  if (!item.due) return false;
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const due = new Date(item.due);
  return due >= start && due <= end;
}

function formatDue(isoValue) {
  const date = new Date(isoValue);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function buildStatusText(filteredCount, totalCountValue) {
  if (totalCountValue === 0) {
    return "Nothing here yet.";
  }

  if (filteredCount === 0) {
    return "No reminders match the current filter.";
  }

  return `${filteredCount} reminder${filteredCount === 1 ? "" : "s"} shown`;
}

function loadItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((item) => ({
        notifiedAt: "",
        repeat: "none",
        ...item,
      }))
      : [];
  } catch {
    return [];
  }
}

function saveItems() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function startReminderPolling() {
  setInterval(checkForDueReminders, 30000);
}

function checkForDueReminders() {
  const now = new Date();
  let changed = false;

  for (const item of state) {
    if (item.done || !item.due) {
      continue;
    }

    const due = new Date(item.due);
    if (Number.isNaN(due.getTime()) || due > now) {
      continue;
    }

    if (!item.notifiedAt) {
      item.notifiedAt = now.toISOString();

      if (!notifiedIds.has(item.id)) {
        notifiedIds.add(item.id);
        window.remindme?.notifyReminder({
          id: item.id,
          title: `RemindMe: ${item.title}`,
          subtitle: repeatLabel(item.repeat),
          body: buildNotificationBody(item),
        });
      }
    }

    changed = true;
  }

  if (changed) {
    saveItems();
  }
}

function completeAndRepeat(item) {
  if (!item.repeat || item.repeat === "none") {
    item.done = true;
    item.notifiedAt = "";
    return;
  }

  advanceRecurringReminder(item);
}

function advanceRecurringReminder(item) {
  const current = item.due ? new Date(item.due) : new Date();
  if (Number.isNaN(current.getTime())) {
    current.setTime(Date.now());
  }

  switch (item.repeat) {
    case "daily":
      current.setDate(current.getDate() + 1);
      break;
    case "weekly":
      current.setDate(current.getDate() + 7);
      break;
    case "monthly":
      current.setMonth(current.getMonth() + 1);
      break;
    default:
      item.done = true;
      item.notifiedAt = "";
      return;
  }

  item.due = current.toISOString();
  item.done = false;
  item.notifiedAt = "";
  notifiedIds.delete(item.id);
}

function startEditing(item) {
  editingId = item.id;
  titleInput.value = item.title;
  dueInput.value = item.due ? toLocalDateTime(item.due) : "";
  priorityInput.value = item.priority || "medium";
  repeatInput.value = item.repeat || "none";
  noteInput.value = item.note || "";
  submitButton.textContent = "Save reminder";
  cancelEditButton.hidden = false;
  titleInput.focus();
  titleInput.select();
  render();
}

function cancelEditing() {
  editingId = null;
  submitButton.textContent = "Add reminder";
  cancelEditButton.hidden = true;
  form.reset();
  priorityInput.value = "medium";
  repeatInput.value = "none";
  titleInput.focus();
  render();
}

function resetEditorState() {
  editingId = null;
  submitButton.textContent = "Add reminder";
  cancelEditButton.hidden = true;
}

function handleNotificationAction(payload) {
  if (!payload?.id) {
    return;
  }

  const item = state.find((entry) => entry.id === payload.id);
  if (!item) {
    return;
  }

  highlightedReminderId = item.id;
  activeFilter = "all";
  [...filterGroup.querySelectorAll("button")].forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.filter === "all");
  });

  switch (payload.action) {
    case "done":
      if (item.repeat && item.repeat !== "none") {
        advanceRecurringReminder(item);
      } else {
        item.done = true;
        item.notifiedAt = "";
      }
      break;
    case "snooze":
      snoozeReminder(item, 1);
      break;
    default:
      break;
  }

  saveItems();
  render();
}

function snoozeReminder(item, days) {
  const base = item.due ? new Date(item.due) : new Date();
  base.setDate(base.getDate() + days);
  item.due = base.toISOString();
  item.done = false;
  item.notifiedAt = "";
  notifiedIds.delete(item.id);
}

function buildNotificationBody(item) {
  const lines = [`Due: ${formatDue(item.due)}`];

  if (item.repeat && item.repeat !== "none") {
    lines.push(`Repeat: ${repeatLabel(item.repeat)}`);
  }

  if (item.note) {
    lines.push(`Note: ${item.note}`);
  }

  return lines.join("\n");
}

function repeatLabel(value) {
  switch (value) {
    case "daily":
      return "Repeats daily";
    case "weekly":
      return "Repeats weekly";
    case "monthly":
      return "Repeats monthly";
    default:
      return "One-time reminder";
  }
}

function toLocalDateTime(isoValue) {
  const date = new Date(isoValue);
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
