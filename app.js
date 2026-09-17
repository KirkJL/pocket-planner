"use strict";

/* ============================================================
   POCKET PLANNER
   app.js

   Frontend application controller.

   Backend:
   Cloudflare Worker + D1 + Durable Objects

   Local:
   IndexedDB via db.js
============================================================ */


/* ============================================================
   1. CONFIGURATION
============================================================ */

/*
 * Replace this after we deploy the Cloudflare Worker.
 *
 * Example:
 *
 * const API_BASE =
 *   "https://pocket-planner-api.YOUR-SUBDOMAIN.workers.dev";
 */

const API_BASE = "https://dark-credit-5334.kirkjlemon.workers.dev/";


/* ============================================================
   2. APPLICATION STATE
============================================================ */

const state = {

  tasks: [],

  token:
    localStorage.getItem("pocketPlannerToken") || null,

  user: null,

  currentView: "today",

  selectedTag: null,

  search: "",

  priorityFilter: "all",

  deferredInstallPrompt: null,

  syncing: false

};


/* ============================================================
   3. ELEMENT CACHE
============================================================ */

const els = {};


const ELEMENT_IDS = [

  "sidebar",
  "menuButton",

  "viewTitle",

  "todayCount",
  "upcomingCount",
  "importantCount",
  "allCount",
  "completedCount",

  "tagFilters",

  "accountLabel",
  "syncStatus",
  "accountButton",

  "briefButton",
  "syncNowButton",
  "installButton",
  "newTaskButton",

  "heroHeading",
  "heroSubheading",

  "dueTodayStat",
  "overdueStat",
  "highPriorityStat",

  "quickAddForm",
  "quickAddInput",

  "searchInput",
  "priorityFilter",

  "taskSectionTitle",
  "visibleTaskCount",
  "taskList",
  "emptyState",

  "notificationStatus",
  "enableNotificationsButton",

  "taskDialog",
  "taskDialogTitle",
  "taskForm",

  "taskId",
  "taskTitle",
  "taskNotes",
  "taskDue",
  "taskPriority",
  "taskReminder",
  "taskRepeat",
  "taskTags",
  "taskAssignee",

  "deleteTaskButton",

  "accountDialog",
  "signedOutPanel",
  "signedInPanel",

  "authUsername",
  "authPassword",

  "registerButton",
  "loginButton",
  "logoutButton",

  "signedInUsername",

  "briefDialog",
  "briefForm",

  "briefTime",
  "briefTimezone",

  "outTime",
  "backTime",

  "homeLat",
  "homeLon",

  "workLat",
  "workLon",

  "briefEnabled",

  "previewBrief",
  "briefOutput",
  "closeBrief",

  "taskTemplate",

  "toast"

];


/* ============================================================
   4. START APPLICATION
============================================================ */

document.addEventListener(
  "DOMContentLoaded",
  init
);


async function init() {

  cacheElements();

  bindEvents();

  await registerServiceWorker();

  await loadLocalTasks();

  updateNotificationStatus();

  updateAccountUI();

  render();

  if (state.token) {

    await syncFromServer();

  }

}


/* ============================================================
   5. CACHE ELEMENTS
============================================================ */

function cacheElements() {

  for (const id of ELEMENT_IDS) {

    els[id] =
      document.getElementById(id);

  }

}


/* ============================================================
   6. EVENT BINDING
============================================================ */

function bindEvents() {

  /* ----------------------------------------------------------
     Navigation
  ---------------------------------------------------------- */

  document
    .querySelectorAll(".nav-item")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          state.currentView =
            button.dataset.view;

          state.selectedTag = null;

          document
            .querySelectorAll(".nav-item")
            .forEach(item =>
              item.classList.remove("active")
            );

          button.classList.add("active");

          els.sidebar.classList.remove("open");

          render();

        }
      );

    });


  /* ----------------------------------------------------------
     Mobile menu
  ---------------------------------------------------------- */

  els.menuButton.addEventListener(
    "click",
    () => {

      els.sidebar.classList.toggle("open");

    }
  );


  /* ----------------------------------------------------------
     New task
  ---------------------------------------------------------- */

  els.newTaskButton.addEventListener(
    "click",
    () => openTaskDialog()
  );


  /* ----------------------------------------------------------
     Quick add
  ---------------------------------------------------------- */

  els.quickAddForm.addEventListener(
    "submit",
    handleQuickAdd
  );


  /* ----------------------------------------------------------
     Search
  ---------------------------------------------------------- */

  els.searchInput.addEventListener(
    "input",
    () => {

      state.search =
        els.searchInput.value
          .trim()
          .toLowerCase();

      render();

    }
  );


  /* ----------------------------------------------------------
     Priority filter
  ---------------------------------------------------------- */

  els.priorityFilter.addEventListener(
    "change",
    () => {

      state.priorityFilter =
        els.priorityFilter.value;

      render();

    }
  );


  /* ----------------------------------------------------------
     Task form
  ---------------------------------------------------------- */

  els.taskForm.addEventListener(
    "submit",
    saveTask
  );


  els.deleteTaskButton.addEventListener(
    "click",
    deleteCurrentTask
  );


  /* ----------------------------------------------------------
     Dialog close buttons
  ---------------------------------------------------------- */

  document
    .querySelectorAll("[data-close]")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          const dialog =
            document.getElementById(
              button.dataset.close
            );

          if (
            dialog &&
            typeof dialog.close === "function"
          ) {

            dialog.close();

          }

        }
      );

    });


  /* ----------------------------------------------------------
     Account
  ---------------------------------------------------------- */

  els.accountButton.addEventListener(
    "click",
    () => {

      updateAccountUI();

      els.accountDialog.showModal();

    }
  );


  els.registerButton.addEventListener(
    "click",
    registerAccount
  );


  els.loginButton.addEventListener(
    "click",
    login
  );


  els.logoutButton.addEventListener(
    "click",
    logout
  );


  /* ----------------------------------------------------------
     Sync
  ---------------------------------------------------------- */

  els.syncNowButton.addEventListener(
    "click",
    syncNow
  );


  /* ----------------------------------------------------------
     Notifications
  ---------------------------------------------------------- */

  els.enableNotificationsButton
    .addEventListener(
      "click",
      enableNotifications
    );


  /* ----------------------------------------------------------
     Morning Brief
  ---------------------------------------------------------- */

  els.briefButton.addEventListener(
    "click",
    openBrief
  );


  els.closeBrief.addEventListener(
    "click",
    () => els.briefDialog.close()
  );


  els.briefForm.addEventListener(
    "submit",
    saveBrief
  );


  els.previewBrief.addEventListener(
    "click",
    showBrief
  );


  /* ----------------------------------------------------------
     PWA install prompt
  ---------------------------------------------------------- */

  window.addEventListener(
    "beforeinstallprompt",
    event => {

      event.preventDefault();

      state.deferredInstallPrompt =
        event;

      els.installButton.hidden = false;

    }
  );


  els.installButton.addEventListener(
    "click",
    installApp
  );


  window.addEventListener(
    "appinstalled",
    () => {

      state.deferredInstallPrompt = null;

      els.installButton.hidden = true;

      toast("Pocket Planner installed");

    }
  );


  /* ----------------------------------------------------------
     Online / offline
  ---------------------------------------------------------- */

  window.addEventListener(
    "online",
    handleOnline
  );


  window.addEventListener(
    "offline",
    handleOffline
  );

}


/* ============================================================
   7. LOCAL DATABASE
============================================================ */

async function loadLocalTasks() {

  try {

    if (
      window.PocketPlannerDB &&
      typeof window.PocketPlannerDB.getAllTasks
        === "function"
    ) {

      state.tasks =
        await window.PocketPlannerDB
          .getAllTasks();

    }

  } catch (error) {

    console.error(
      "Failed to load local tasks:",
      error
    );

    toast(
      "Could not load local tasks"
    );

  }

}


async function saveTaskLocal(task) {

  if (
    window.PocketPlannerDB &&
    typeof window.PocketPlannerDB.putTask
      === "function"
  ) {

    await window.PocketPlannerDB
      .putTask(task);

  }

}


async function deleteTaskLocal(id) {

  if (
    window.PocketPlannerDB &&
    typeof window.PocketPlannerDB.deleteTask
      === "function"
  ) {

    await window.PocketPlannerDB
      .deleteTask(id);

  }

}


/* ============================================================
   8. TASK DIALOG
============================================================ */

function openTaskDialog(task = null) {

  els.taskForm.reset();

  els.taskId.value = "";

  els.taskPriority.value =
    "normal";

  els.taskRepeat.value =
    "none";

  els.taskReminder.value = "";

  els.taskAssignee.value = "";

  els.taskTags.value = "";

  els.deleteTaskButton.hidden = true;

  els.taskDialogTitle.textContent =
    "New task";


  if (task) {

    els.taskDialogTitle.textContent =
      "Edit task";

    els.taskId.value =
      task.id;

    els.taskTitle.value =
      task.title || "";

    els.taskNotes.value =
      task.notes || "";

    els.taskDue.value =
      toLocalInputValue(
        task.dueAt
      );

    els.taskPriority.value =
      task.priority || "normal";

    els.taskReminder.value =
      task.reminderMinutes ??
      "";

    els.taskRepeat.value =
      task.repeat || "none";

    els.taskTags.value =
      Array.isArray(task.tags)
        ? task.tags.join(", ")
        : "";

    els.taskAssignee.value =
      task.assigneeUsername || "";

    els.deleteTaskButton.hidden =
      false;

  }


  els.taskDialog.showModal();

  setTimeout(
    () => els.taskTitle.focus(),
    50
  );

}


/* ============================================================
   9. SAVE TASK
============================================================ */

async function saveTask(event) {

  event.preventDefault();


  const title =
    els.taskTitle.value
      .trim();


  if (!title) {

    toast(
      "Give the task a name"
    );

    return;

  }


  const existing =
    state.tasks.find(
      task =>
        task.id ===
        els.taskId.value
    );


  const now =
    new Date().toISOString();


  const dueAt =
    els.taskDue.value
      ? new Date(
          els.taskDue.value
        ).toISOString()
      : null;


  const reminderValue =
    els.taskReminder.value;


  const task = {

    id:
      existing?.id ||
      crypto.randomUUID(),

    ownerId:
      existing?.ownerId ||
      state.user?.id ||
      null,

    title:
      title.slice(0, 160),

    notes:
      els.taskNotes.value
        .trim()
        .slice(0, 4000),

    dueAt,

    priority:
      els.taskPriority.value,

    reminderMinutes:
      reminderValue === ""
        ? null
        : Number(
            reminderValue
          ),

    repeat:
      els.taskRepeat.value,

    status:
      existing?.status ||
      "todo",

    completedAt:
      existing?.completedAt ||
      null,

    tags:
      parseTags(
        els.taskTags.value
      ),

    assigneeUsername:
      normalizeAssignee(
        els.taskAssignee.value
      ),

    createdAt:
      existing?.createdAt ||
      now,

    updatedAt:
      now

  };


  try {

    await saveTaskLocal(task);

    upsertStateTask(task);

    render();

    els.taskDialog.close();


    if (state.token) {

      try {

        const response =
          await api(
            "/api/tasks",
            {
              method: "PUT",

              body:
                JSON.stringify(
                  task
                )
            }
          );


        if (response.task) {

          const serverTask = {

            ...task,
            ...response.task,

            tags:
              response.task.tags ??
              task.tags,

            assigneeUsername:
              response.task
                .assigneeUsername ??
              task.assigneeUsername

          };


          await saveTaskLocal(
            serverTask
          );

          upsertStateTask(
            serverTask
          );

          render();

        }


        setSyncStatus(
          "Synced"
        );

      } catch (error) {

        console.error(error);

        setSyncStatus(
          "Saved locally — sync pending"
        );

        toast(
          "Task saved locally. Cloud sync will retry later."
        );

      }

    } else {

      setSyncStatus(
        "Stored on this device"
      );

    }


  } catch (error) {

    console.error(error);

    toast(
      "Could not save task"
    );

  }

}


/* ============================================================
   10. QUICK ADD
============================================================ */

async function handleQuickAdd(event) {

  event.preventDefault();


  const raw =
    els.quickAddInput.value
      .trim();


  if (!raw) {

    return;

  }


  /*
   * Quick add deliberately stays conservative.
   *
   * We currently parse:
   *
   * #tags
   *
   * We do NOT guess dates from natural language yet.
   * Incorrect reminders are worse than making the user
   * choose the date explicitly.
   */

  const tags =
    Array.from(
      raw.matchAll(
        /#([a-zA-Z0-9_-]+)/g
      )
    )
      .map(match =>
        match[1].toLowerCase()
      );


  const title =
    raw
      .replace(
        /#[a-zA-Z0-9_-]+/g,
        ""
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim();


  if (!title) {

    toast(
      "Give the task a name"
    );

    return;

  }


  const now =
    new Date().toISOString();


  const task = {

    id:
      crypto.randomUUID(),

    ownerId:
      state.user?.id ||
      null,

    title:
      title.slice(0, 160),

    notes: "",

    dueAt: null,

    priority: "normal",

    reminderMinutes: null,

    repeat: "none",

    status: "todo",

    completedAt: null,

    tags:
      Array.from(
        new Set(tags)
      ),

    assigneeUsername: null,

    createdAt: now,

    updatedAt: now

  };


  try {

    await saveTaskLocal(task);

    upsertStateTask(task);

    els.quickAddInput.value = "";

    render();


    if (state.token) {

      try {

        await api(
          "/api/tasks",
          {
            method: "PUT",
            body:
              JSON.stringify(task)
          }
        );

        setSyncStatus(
          "Synced"
        );

      } catch (error) {

        console.error(error);

        setSyncStatus(
          "Saved locally — sync pending"
        );

      }

    }


  } catch (error) {

    console.error(error);

    toast(
      "Could not add task"
    );

  }

}


/* ============================================================
   11. DELETE TASK
============================================================ */

async function deleteCurrentTask() {

  const id =
    els.taskId.value;


  if (!id) {

    return;

  }


  const task =
    state.tasks.find(
      item => item.id === id
    );


  if (!task) {

    return;

  }


  const confirmed =
    window.confirm(
      `Delete "${task.title}"?`
    );


  if (!confirmed) {

    return;

  }


  try {

    await deleteTaskLocal(id);

    state.tasks =
      state.tasks.filter(
        item => item.id !== id
      );

    els.taskDialog.close();

    render();


    if (state.token) {

      try {

        await api(
          `/api/tasks/${encodeURIComponent(id)}`,
          {
            method: "DELETE"
          }
        );

        setSyncStatus(
          "Synced"
        );

      } catch (error) {

        console.error(error);

        setSyncStatus(
          "Deleted locally — cloud sync pending"
        );

      }

    }


  } catch (error) {

    console.error(error);

    toast(
      "Could not delete task"
    );

  }

}


/* ============================================================
   12. COMPLETE / UNCOMPLETE TASK
============================================================ */

async function toggleTaskComplete(task) {

  const completed =
    task.status !== "completed";


  const updated = {

    ...task,

    status:
      completed
        ? "completed"
        : "todo",

    completedAt:
      completed
        ? new Date().toISOString()
        : null,

    updatedAt:
      new Date().toISOString()

  };


  try {

    await saveTaskLocal(updated);

    upsertStateTask(updated);

    render();


    if (state.token) {

      try {

        await api(
          "/api/tasks",
          {
            method: "PUT",

            body:
              JSON.stringify(
                updated
              )
          }
        );

        setSyncStatus(
          "Synced"
        );

      } catch (error) {

        console.error(error);

        setSyncStatus(
          "Saved locally — sync pending"
        );

      }

    }


  } catch (error) {

    console.error(error);

    toast(
      "Could not update task"
    );

  }

}


/* ============================================================
   13. STATE HELPERS
============================================================ */

function upsertStateTask(task) {

  const index =
    state.tasks.findIndex(
      item =>
        item.id === task.id
    );


  if (index === -1) {

    state.tasks.push(task);

  } else {

    state.tasks[index] =
      task;

  }

}


/* ============================================================
   14. RENDER APPLICATION
============================================================ */

function render() {

  updateViewCopy();

  renderCounts();

  renderTags();

  renderTasks();

  renderStats();

}


/* ============================================================
   15. VIEW COPY
============================================================ */

function updateViewCopy() {

  const copy = {

    today: {
      title: "Today",
      hero: "What's on today?",
      sub:
        "Keep the important stuff visible and everything else out of your head."
    },

    upcoming: {
      title: "Upcoming",
      hero: "What's coming up?",
      sub:
        "See what's ahead before it becomes today's problem."
    },

    important: {
      title: "Important",
      hero: "The stuff that matters.",
      sub:
        "High and critical priority tasks without the noise."
    },

    all: {
      title: "All tasks",
      hero: "Everything in one place.",
      sub:
        "Your complete task list across work, home and everything in between."
    },

    completed: {
      title: "Completed",
      hero: "Done and dusted.",
      sub:
        "A record of the things you've already got out of the way."
    }

  };


  const selected =
    copy[state.currentView] ||
    copy.today;


  els.viewTitle.textContent =
    selected.title;

  els.taskSectionTitle.textContent =
    selected.title;

  els.heroHeading.textContent =
    selected.hero;

  els.heroSubheading.textContent =
    selected.sub;

}


/* ============================================================
   16. FILTER TASKS
============================================================ */

function getVisibleTasks() {

  let tasks =
    [...state.tasks];


  const now =
    new Date();


  const todayKey =
    localDateKey(now);


  tasks =
    tasks.filter(task => {

      const completed =
        task.status === "completed";


      if (
        state.currentView ===
        "completed"
      ) {

        return completed;

      }


      if (completed) {

        return false;

      }


      if (
        state.currentView ===
        "today"
      ) {

        if (!task.dueAt) {

          return false;

        }

        return (
          localDateKey(
            new Date(task.dueAt)
          ) === todayKey
        );

      }


      if (
        state.currentView ===
        "upcoming"
      ) {

        if (!task.dueAt) {

          return false;

        }

        return (
          new Date(task.dueAt) >
          endOfToday()
        );

      }


      if (
        state.currentView ===
        "important"
      ) {

        return (
          task.priority === "high" ||
          task.priority === "critical"
        );

      }


      return true;

    });


  if (state.selectedTag) {

    tasks =
      tasks.filter(task =>
        Array.isArray(task.tags) &&
        task.tags.includes(
          state.selectedTag
        )
      );

  }


  if (
    state.priorityFilter !==
    "all"
  ) {

    tasks =
      tasks.filter(
        task =>
          task.priority ===
          state.priorityFilter
      );

  }


  if (state.search) {

    tasks =
      tasks.filter(task => {

        const haystack = [

          task.title,

          task.notes,

          ...(task.tags || []),

          task.assigneeUsername

        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();


        return haystack.includes(
          state.search
        );

      });

  }


  tasks.sort(sortTasks);


  return tasks;

}


/* ============================================================
   17. SORT TASKS
============================================================ */

function sortTasks(a, b) {

  const priorityWeight = {

    critical: 0,
    high: 1,
    normal: 2,
    low: 3

  };


  if (
    a.status !== b.status
  ) {

    return (
      a.status === "completed"
        ? 1
        : -1
    );

  }


  if (
    a.dueAt &&
    b.dueAt
  ) {

    const difference =
      new Date(a.dueAt) -
      new Date(b.dueAt);


    if (difference !== 0) {

      return difference;

    }

  }


  if (
    a.dueAt &&
    !b.dueAt
  ) {

    return -1;

  }


  if (
    !a.dueAt &&
    b.dueAt
  ) {

    return 1;

  }


  return (
    (priorityWeight[a.priority] ?? 9) -
    (priorityWeight[b.priority] ?? 9)
  );

}


/* ============================================================
   18. RENDER TASKS
============================================================ */

function renderTasks() {

  const tasks =
    getVisibleTasks();


  els.taskList.textContent = "";


  els.visibleTaskCount.textContent =
    `${tasks.length} ${
      tasks.length === 1
        ? "task"
        : "tasks"
    }`;


  els.emptyState.hidden =
    tasks.length !== 0;


  for (const task of tasks) {

    const fragment =
      els.taskTemplate.content
        .cloneNode(true);


    const card =
      fragment.querySelector(
        ".task-card"
      );


    const check =
      fragment.querySelector(
        ".task-check"
      );


    const main =
      fragment.querySelector(
        ".task-main"
      );


    const title =
      fragment.querySelector(
        ".task-title"
      );


    const notes =
      fragment.querySelector(
        ".task-notes"
      );


    const priority =
      fragment.querySelector(
        ".priority-pill"
      );


    const due =
      fragment.querySelector(
        ".task-due"
      );


    const repeat =
      fragment.querySelector(
        ".task-repeat"
      );


    const assignee =
      fragment.querySelector(
        ".task-assignee"
      );


    const tags =
      fragment.querySelector(
        ".task-tags"
      );


    card.dataset.priority =
      task.priority || "normal";


    if (
      task.status ===
      "completed"
    ) {

      card.classList.add(
        "completed"
      );

    }


    title.textContent =
      task.title;


    notes.textContent =
      task.notes || "";


    priority.textContent =
      task.priority || "normal";

    priority.classList.add(
      task.priority || "normal"
    );


    if (task.dueAt) {

      due.textContent =
        formatDueDate(
          task.dueAt
        );


      if (
        task.status !== "completed" &&
        new Date(task.dueAt) <
          new Date()
      ) {

        due.classList.add(
          "overdue"
        );

      }

    } else {

      due.textContent =
        "No due date";

    }


    if (
      task.repeat &&
      task.repeat !== "none"
    ) {

      repeat.textContent =
        `↻ ${capitalize(
          task.repeat
        )}`;

    } else {

      repeat.textContent = "";

    }


    if (
      task.assigneeUsername
    ) {

      assignee.textContent =
        `@${task.assigneeUsername}`;

    } else {

      assignee.textContent = "";

    }


    for (
      const tag of
      task.tags || []
    ) {

      const chip =
        document.createElement(
          "span"
        );

      chip.className =
        "task-tag";

      chip.textContent =
        `#${tag}`;

      tags.appendChild(chip);

    }


    check.setAttribute(
      "aria-label",
      task.status === "completed"
        ? `Mark ${task.title} incomplete`
        : `Complete ${task.title}`
    );


    check.addEventListener(
      "click",
      event => {

        event.stopPropagation();

        toggleTaskComplete(task);

      }
    );


    main.addEventListener(
      "click",
      () => openTaskDialog(task)
    );


    els.taskList.appendChild(
      fragment
    );

  }

}


/* ============================================================
   19. COUNTS
============================================================ */

function renderCounts() {

  const active =
    state.tasks.filter(
      task =>
        task.status !==
        "completed"
    );


  const today =
    active.filter(
      task =>
        task.dueAt &&
        isToday(task.dueAt)
    );


  const upcoming =
    active.filter(
      task =>
        task.dueAt &&
        new Date(task.dueAt) >
          endOfToday()
    );


  const important =
    active.filter(
      task =>
        task.priority === "high" ||
        task.priority === "critical"
    );


  const completed =
    state.tasks.filter(
      task =>
        task.status ===
        "completed"
    );


  els.todayCount.textContent =
    String(today.length);

  els.upcomingCount.textContent =
    String(upcoming.length);

  els.importantCount.textContent =
    String(important.length);

  els.allCount.textContent =
    String(active.length);

  els.completedCount.textContent =
    String(completed.length);

}


/* ============================================================
   20. STATS
============================================================ */

function renderStats() {

  const active =
    state.tasks.filter(
      task =>
        task.status !==
        "completed"
    );


  const now =
    new Date();


  const dueToday =
    active.filter(
      task =>
        task.dueAt &&
        isToday(task.dueAt)
    );


  const overdue =
    active.filter(
      task =>
        task.dueAt &&
        new Date(task.dueAt) <
          now
    );


  const important =
    active.filter(
      task =>
        task.priority === "high" ||
        task.priority === "critical"
    );


  els.dueTodayStat.textContent =
    String(dueToday.length);

  els.overdueStat.textContent =
    String(overdue.length);

  els.highPriorityStat.textContent =
    String(important.length);

}


/* ============================================================
   21. TAGS
============================================================ */

function renderTags() {

  const tags =
    new Map();


  for (
    const task of
    state.tasks
  ) {

    if (
      task.status ===
      "completed"
    ) {

      continue;

    }


    for (
      const tag of
      task.tags || []
    ) {

      tags.set(
        tag,
        (tags.get(tag) || 0) + 1
      );

    }

  }


  els.tagFilters.textContent = "";


  const sorted =
    [...tags.entries()]
      .sort(
        (a, b) =>
          a[0].localeCompare(b[0])
      );


  for (
    const [tag, count] of
    sorted
  ) {

    const button =
      document.createElement(
        "button"
      );


    button.type =
      "button";

    button.className =
      "tag-filter";


    if (
      state.selectedTag === tag
    ) {

      button.classList.add(
        "active"
      );

    }


    button.textContent =
      `#${tag} ${count}`;


    button.addEventListener(
      "click",
      () => {

        state.selectedTag =
          state.selectedTag === tag
            ? null
            : tag;

        render();

      }
    );


    els.tagFilters.appendChild(
      button
    );

  }

}


/* ============================================================
   22. ACCOUNT REGISTRATION
============================================================ */

async function registerAccount() {

  const username =
    normalizeUsername(
      els.authUsername.value
    );


  const password =
    els.authPassword.value;


  if (
    !/^[a-z0-9._-]{3,50}$/.test(
      username
    )
  ) {

    toast(
      "Username must be 3–50 characters using letters, numbers, ., _ or -"
    );

    return;

  }


  if (
    password.length < 12
  ) {

    toast(
      "Password must be at least 12 characters"
    );

    return;

  }


  try {

    const result =
      await api(
        "/api/auth/register",
        {
          method: "POST",

          auth: false,

          body:
            JSON.stringify({
              username,
              password
            })
        }
      );


    setSession(
      result.token,
      result.user
    );


    els.authPassword.value = "";

    updateAccountUI();

    els.accountDialog.close();


    await pushLocalTasksToServer();

    await syncFromServer();


    toast(
      "Account created"
    );


  } catch (error) {

    toast(error.message);

  }

}


/* ============================================================
   23. LOGIN
============================================================ */

async function login() {

  const username =
    normalizeUsername(
      els.authUsername.value
    );


  const password =
    els.authPassword.value;


  if (
    !username ||
    !password
  ) {

    toast(
      "Enter your username and password"
    );

    return;

  }


  try {

    const result =
      await api(
        "/api/auth/login",
        {
          method: "POST",

          auth: false,

          body:
            JSON.stringify({
              username,
              password
            })
        }
      );


    setSession(
      result.token,
      result.user
    );


    els.authPassword.value = "";

    updateAccountUI();

    els.accountDialog.close();


    await pushLocalTasksToServer();

    await syncFromServer();


    toast(
      "Signed in"
    );


  } catch (error) {

    toast(error.message);

  }

}


/* ============================================================
   24. LOGOUT
============================================================ */

async function logout() {

  try {

    if (state.token) {

      await api(
        "/api/auth/logout",
        {
          method: "POST"
        }
      );

    }

  } catch (error) {

    console.warn(
      "Server logout failed:",
      error
    );

  }


  clearSession();

  updateAccountUI();

  els.accountDialog.close();

  setSyncStatus(
    "Tasks are stored on this device."
  );

  toast(
    "Signed out"
  );

}


/* ============================================================
   25. SESSION
============================================================ */

function setSession(
  token,
  user
) {

  state.token = token;

  state.user = user;


  localStorage.setItem(
    "pocketPlannerToken",
    token
  );


  localStorage.setItem(
    "pocketPlannerUser",
    JSON.stringify(user)
  );

}


function clearSession() {

  state.token = null;

  state.user = null;


  localStorage.removeItem(
    "pocketPlannerToken"
  );


  localStorage.removeItem(
    "pocketPlannerUser"
  );

}


function restoreStoredUser() {

  try {

    const stored =
      localStorage.getItem(
        "pocketPlannerUser"
      );


    if (stored) {

      state.user =
        JSON.parse(stored);

    }

  } catch {

    state.user = null;

  }

}


restoreStoredUser();


/* ============================================================
   26. ACCOUNT UI
============================================================ */

function updateAccountUI() {

  const signedIn =
    Boolean(
      state.token &&
      state.user
    );


  els.signedOutPanel.hidden =
    signedIn;

  els.signedInPanel.hidden =
    !signedIn;


  if (signedIn) {

    els.accountLabel.textContent =
      `@${state.user.username}`;

    els.accountButton.textContent =
      "Account";

    els.signedInUsername.textContent =
      `@${state.user.username}`;

    setSyncStatus(
      navigator.onLine
        ? "Cloud sync enabled"
        : "Offline"
    );

  } else {

    els.accountLabel.textContent =
      "Local mode";

    els.accountButton.textContent =
      "Sign in";

    setSyncStatus(
      "Tasks are stored on this device."
    );

  }

}


/* ============================================================
   27. SYNC
============================================================ */

async function syncNow() {

  if (!state.token) {

    toast(
      "Sign in to sync between devices"
    );

    els.accountDialog.showModal();

    return;

  }


  await pushLocalTasksToServer();

  await syncFromServer();

}


async function pushLocalTasksToServer() {

  if (
    !state.token ||
    !navigator.onLine
  ) {

    return;

  }


  for (
    const task of
    state.tasks
  ) {

    try {

      await api(
        "/api/tasks",
        {
          method: "PUT",

          body:
            JSON.stringify(task)
        }
      );

    } catch (error) {

      console.error(
        "Failed to upload task:",
        task.id,
        error
      );

    }

  }

}


async function syncFromServer() {

  if (
    !state.token ||
    !navigator.onLine ||
    state.syncing
  ) {

    return;

  }


  state.syncing = true;

  setSyncStatus(
    "Syncing..."
  );


  try {

    const result =
      await api(
        "/api/tasks"
      );


    const remoteTasks =
      Array.isArray(result.tasks)
        ? result.tasks
        : [];


    const merged =
      mergeTasks(
        state.tasks,
        remoteTasks
      );


    state.tasks = merged;


    for (
      const task of
      merged
    ) {

      await saveTaskLocal(task);

    }


    setSyncStatus(
      "Synced"
    );


    render();


  } catch (error) {

    console.error(
      "Sync failed:",
      error
    );


    if (
      error.status === 401
    ) {

      clearSession();

      updateAccountUI();

      toast(
        "Your session expired. Sign in again."
      );

    } else {

      setSyncStatus(
        "Sync failed"
      );

    }


  } finally {

    state.syncing = false;

  }

}


/* ============================================================
   28. MERGE LOCAL + REMOTE TASKS
============================================================ */

function mergeTasks(
  localTasks,
  remoteTasks
) {

  const merged =
    new Map();


  for (
    const task of
    localTasks
  ) {

    merged.set(
      task.id,
      task
    );

  }


  for (
    const remote of
    remoteTasks
  ) {

    const local =
      merged.get(remote.id);


    if (!local) {

      merged.set(
        remote.id,
        remote
      );

      continue;

    }


    const localUpdated =
      Date.parse(
        local.updatedAt || 0
      );


    const remoteUpdated =
      Date.parse(
        remote.updatedAt || 0
      );


    if (
      remoteUpdated >=
      localUpdated
    ) {

      merged.set(
        remote.id,
        {
          ...local,
          ...remote,

          tags:
            remote.tags ??
            local.tags ??
            [],

          assigneeUsername:
            remote.assigneeUsername ??
            local.assigneeUsername ??
            null
        }
      );

    }

  }


  return [...merged.values()];

}


/* ============================================================
   29. MORNING BRIEF
============================================================ */

async function openBrief() {

  if (!state.token) {

    toast(
      "Sign in to configure Morning Brief"
    );

    els.accountDialog.showModal();

    return;

  }


  try {

    const result =
      await api(
        "/api/preferences"
      );


    const p =
      result.preferences;


    els.briefTime.value =
      p.morning_brief_time ||
      "07:00";


    els.briefTimezone.value =
      p.timezone ||
      "Europe/London";


    els.outTime.value =
      p.commute_out_time ||
      "08:00";


    els.backTime.value =
      p.commute_home_time ||
      "17:00";


    els.homeLat.value =
      p.home_lat ?? "";


    els.homeLon.value =
      p.home_lon ?? "";


    els.workLat.value =
      p.work_lat ?? "";


    els.workLon.value =
      p.work_lon ?? "";


    els.briefEnabled.checked =
      Boolean(
        p.morning_brief_enabled
      );


    els.briefOutput.textContent =
      "";


    els.briefDialog.showModal();


  } catch (error) {

    toast(error.message);

  }

}


/* ============================================================
   30. SAVE MORNING BRIEF
============================================================ */

async function saveBrief(event) {

  event.preventDefault();


  if (!state.token) {

    return;

  }


  const payload = {

    timezone:
      els.briefTimezone.value
        .trim(),

    morning_brief_enabled:
      els.briefEnabled.checked,

    morning_brief_time:
      els.briefTime.value,

    /*
     * JS weekday:
     *
     * 0 Sunday
     * 1 Monday
     * ...
     * 6 Saturday
     *
     * Default:
     * Monday-Friday.
     */

    morning_brief_days:
      [1, 2, 3, 4, 5],

    home_lat:
      numberOrNull(
        els.homeLat.value
      ),

    home_lon:
      numberOrNull(
        els.homeLon.value
      ),

    work_lat:
      numberOrNull(
        els.workLat.value
      ),

    work_lon:
      numberOrNull(
        els.workLon.value
      ),

    commute_out_time:
      els.outTime.value,

    commute_home_time:
      els.backTime.value

  };


  if (
    payload.home_lat !== null &&
    (
      payload.home_lat < -90 ||
      payload.home_lat > 90
    )
  ) {

    toast(
      "Home latitude must be between -90 and 90"
    );

    return;

  }


  if (
    payload.home_lon !== null &&
    (
      payload.home_lon < -180 ||
      payload.home_lon > 180
    )
  ) {

    toast(
      "Home longitude must be between -180 and 180"
    );

    return;

  }


  if (
    payload.work_lat !== null &&
    (
      payload.work_lat < -90 ||
      payload.work_lat > 90
    )
  ) {

    toast(
      "Work latitude must be between -90 and 90"
    );

    return;

  }


  if (
    payload.work_lon !== null &&
    (
      payload.work_lon < -180 ||
      payload.work_lon > 180
    )
  ) {

    toast(
      "Work longitude must be between -180 and 180"
    );

    return;

  }


  try {

    await api(
      "/api/preferences",
      {
        method: "PUT",

        body:
          JSON.stringify(
            payload
          )
      }
    );


    toast(
      "Morning Brief scheduled"
    );


    await showBrief();


  } catch (error) {

    toast(error.message);

  }

}


/* ============================================================
   31. PREVIEW MORNING BRIEF
============================================================ */

async function showBrief() {

  if (!state.token) {

    return;

  }


  try {

    els.briefOutput.textContent =
      "Building today's brief...";


    const brief =
      await api(
        "/api/brief/today"
      );


    const lines = [];


    if (brief.notification) {

      lines.push(
        brief.notification
      );

    }


    if (
      Array.isArray(brief.tasks) &&
      brief.tasks.length
    ) {

      lines.push("");

      lines.push(
        "TODAY"
      );


      for (
        const task of
        brief.tasks
      ) {

        lines.push(
          `• ${task.title}`
        );

      }

    }


    if (
      Array.isArray(brief.overdue) &&
      brief.overdue.length
    ) {

      lines.push("");

      lines.push(
        "OVERDUE"
      );


      for (
        const task of
        brief.overdue
      ) {

        lines.push(
          `• ${task.title}`
        );

      }

    }


    els.briefOutput.textContent =
      lines.join("\n");


  } catch (error) {

    els.briefOutput.textContent =
      "";

    toast(error.message);

  }

}


/* ============================================================
   32. NOTIFICATIONS
============================================================ */

function updateNotificationStatus() {

  if (
    !("Notification" in window)
  ) {

    els.notificationStatus.textContent =
      "Notifications are not supported by this browser.";

    els.enableNotificationsButton.disabled =
      true;

    return;

  }


  switch (
    Notification.permission
  ) {

    case "granted":

      els.notificationStatus.textContent =
        "Notifications are enabled.";

      els.enableNotificationsButton.textContent =
        "Enabled";

      els.enableNotificationsButton.disabled =
        true;

      break;


    case "denied":

      els.notificationStatus.textContent =
        "Notifications are blocked. Enable them in your browser/site settings.";

      els.enableNotificationsButton.textContent =
        "Blocked";

      els.enableNotificationsButton.disabled =
        true;

      break;


    default:

      els.notificationStatus.textContent =
        "Enable notifications to receive planner reminders.";

      els.enableNotificationsButton.textContent =
        "Enable notifications";

      els.enableNotificationsButton.disabled =
        false;

  }

}


async function enableNotifications() {

  if (
    !("Notification" in window)
  ) {

    return;

  }


  try {

    const permission =
      await Notification.requestPermission();


    updateNotificationStatus();


    if (
      permission ===
      "granted"
    ) {

      toast(
        "Notifications enabled"
      );


      /*
       * Push subscription registration is intentionally
       * separate from merely requesting notification
       * permission.
       *
       * We'll wire the final Web Push subscription when
       * the Cloudflare push sender is deployed.
       */

    }


  } catch (error) {

    console.error(error);

    toast(
      "Could not enable notifications"
    );

  }

}


/* ============================================================
   33. SERVICE WORKER
============================================================ */

async function registerServiceWorker() {

  if (
    !("serviceWorker" in navigator)
  ) {

    return;

  }


  try {

    await navigator.serviceWorker.register(
      "./sw.js",
      {
        scope: "./"
      }
    );


  } catch (error) {

    console.error(
      "Service worker registration failed:",
      error
    );

  }

}


/* ============================================================
   34. PWA INSTALL
============================================================ */

async function installApp() {

  if (
    !state.deferredInstallPrompt
  ) {

    return;

  }


  state.deferredInstallPrompt.prompt();


  try {

    await state
      .deferredInstallPrompt
      .userChoice;

  } catch (error) {

    console.warn(error);

  }


  state.deferredInstallPrompt = null;

  els.installButton.hidden = true;

}


/* ============================================================
   35. ONLINE / OFFLINE
============================================================ */

async function handleOnline() {

  if (state.token) {

    setSyncStatus(
      "Back online — syncing..."
    );

    await syncNow();

  } else {

    setSyncStatus(
      "Online — local mode"
    );

  }

}


function handleOffline() {

  setSyncStatus(
    "Offline — changes stay on this device"
  );

}


/* ============================================================
   36. API CLIENT
============================================================ */

async function api(
  path,
  options = {}
) {

  if (
    API_BASE.includes(
      "REPLACE-ME"
    )
  ) {

    throw new Error(
      "Cloud backend has not been configured yet."
    );

  }


  const {

    auth = true,
    ...fetchOptions

  } = options;


  const headers =
    new Headers(
      fetchOptions.headers || {}
    );


  headers.set(
    "Accept",
    "application/json"
  );


  if (
    fetchOptions.body
  ) {

    headers.set(
      "Content-Type",
      "application/json"
    );

  }


  if (
    auth &&
    state.token
  ) {

    headers.set(
      "Authorization",
      `Bearer ${state.token}`
    );

  }


  let response;


  try {

    response =
      await fetch(
        `${API_BASE}${path}`,
        {
          ...fetchOptions,
          headers
        }
      );


  } catch {

    throw new Error(
      "Could not reach Pocket Planner cloud."
    );

  }


  const contentType =
    response.headers.get(
      "content-type"
    ) || "";


  let data = {};


  if (
    contentType.includes(
      "application/json"
    )
  ) {

    try {

      data =
        await response.json();

    } catch {

      data = {};

    }

  }


  if (!response.ok) {

    const error =
      new Error(
        data.error ||
        `Request failed (${response.status})`
      );


    error.status =
      response.status;


    throw error;

  }


  return data;

}


/* ============================================================
   37. DATE HELPERS
============================================================ */

function isToday(value) {

  const date =
    new Date(value);


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return false;

  }


  return (
    localDateKey(date) ===
    localDateKey(
      new Date()
    )
  );

}


function localDateKey(date) {

  return [

    date.getFullYear(),

    String(
      date.getMonth() + 1
    ).padStart(2, "0"),

    String(
      date.getDate()
    ).padStart(2, "0")

  ].join("-");

}


function endOfToday() {

  const date =
    new Date();


  date.setHours(
    23,
    59,
    59,
    999
  );


  return date;

}


function toLocalInputValue(value) {

  if (!value) {

    return "";

  }


  const date =
    new Date(value);


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return "";

  }


  const year =
    date.getFullYear();


  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");


  const day =
    String(
      date.getDate()
    ).padStart(2, "0");


  const hours =
    String(
      date.getHours()
    ).padStart(2, "0");


  const minutes =
    String(
      date.getMinutes()
    ).padStart(2, "0");


  return (
    `${year}-${month}-${day}` +
    `T${hours}:${minutes}`
  );

}


function formatDueDate(value) {

  const date =
    new Date(value);


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return "Invalid date";

  }


  const now =
    new Date();


  const time =
    new Intl.DateTimeFormat(
      undefined,
      {
        hour: "2-digit",
        minute: "2-digit"
      }
    ).format(date);


  if (isToday(date)) {

    return `Today · ${time}`;

  }


  const tomorrow =
    new Date();


  tomorrow.setDate(
    tomorrow.getDate() + 1
  );


  if (
    localDateKey(date) ===
    localDateKey(tomorrow)
  ) {

    return `Tomorrow · ${time}`;

  }


  const sameYear =
    date.getFullYear() ===
    now.getFullYear();


  const formatter =
    new Intl.DateTimeFormat(
      undefined,
      sameYear
        ? {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit"
          }
        : {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
          }
    );


  return formatter.format(date);

}


/* ============================================================
   38. TEXT HELPERS
============================================================ */

function parseTags(value) {

  return Array.from(

    new Set(

      String(value || "")
        .split(",")
        .map(tag =>
          tag
            .trim()
            .toLowerCase()
            .replace(
              /^#/,
              ""
            )
        )
        .filter(Boolean)
        .map(tag =>
          tag.slice(0, 40)
        )

    )

  ).slice(0, 20);

}


function normalizeAssignee(value) {

  const username =
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(
        /^@/,
        ""
      );


  if (!username) {

    return null;

  }


  if (
    !/^[a-z0-9._-]{3,50}$/.test(
      username
    )
  ) {

    return null;

  }


  return username;

}


function normalizeUsername(value) {

  return String(value || "")
    .trim()
    .toLowerCase();

}


function capitalize(value) {

  const text =
    String(value || "");


  if (!text) {

    return "";

  }


  return (
    text.charAt(0).toUpperCase() +
    text.slice(1)
  );

}


function numberOrNull(value) {

  if (
    value === "" ||
    value === null ||
    value === undefined
  ) {

    return null;

  }


  const number =
    Number(value);


  return Number.isFinite(number)
    ? number
    : null;

}


/* ============================================================
   39. STATUS / TOAST
============================================================ */

function setSyncStatus(message) {

  els.syncStatus.textContent =
    message;

}


let toastTimer = null;


function toast(message) {

  if (!message) {

    return;

  }


  clearTimeout(
    toastTimer
  );


  els.toast.textContent =
    String(message);


  els.toast.classList.add(
    "show"
  );


  toastTimer =
    setTimeout(
      () => {

        els.toast.classList.remove(
          "show"
        );

      },
      3200
    );

    }
