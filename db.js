"use strict";

/* ============================================================
   POCKET PLANNER
   db.js

   Local IndexedDB storage layer.

   Responsibilities:
   - Store tasks locally
   - Read tasks locally
   - Delete tasks locally
   - Keep the PWA usable offline

   Cloud sync is handled separately by app.js.
============================================================ */


/* ============================================================
   1. DATABASE CONFIGURATION
============================================================ */

const DB_NAME = "PocketPlannerDB";
const DB_VERSION = 1;

const TASK_STORE = "tasks";


/* ============================================================
   2. OPEN DATABASE
============================================================ */

function openDatabase() {

  return new Promise((resolve, reject) => {

    if (!("indexedDB" in window)) {

      reject(
        new Error(
          "IndexedDB is not supported by this browser."
        )
      );

      return;

    }


    const request =
      indexedDB.open(
        DB_NAME,
        DB_VERSION
      );


    /* --------------------------------------------------------
       Database upgrade / first creation
    -------------------------------------------------------- */

    request.onupgradeneeded = event => {

      const db =
        event.target.result;


      /*
       * TASK STORE
       *
       * Primary key:
       * task.id
       *
       * We deliberately use UUID task IDs generated in app.js.
       */

      if (
        !db.objectStoreNames.contains(
          TASK_STORE
        )
      ) {

        const store =
          db.createObjectStore(
            TASK_STORE,
            {
              keyPath: "id"
            }
          );


        /*
         * Indexes aren't strictly required for the current UI,
         * because the dataset on a personal planner is small.
         *
         * They're useful later when we want more efficient:
         *
         * - due date queries
         * - completion queries
         * - sync processing
         */

        store.createIndex(
          "dueAt",
          "dueAt",
          {
            unique: false
          }
        );


        store.createIndex(
          "status",
          "status",
          {
            unique: false
          }
        );


        store.createIndex(
          "updatedAt",
          "updatedAt",
          {
            unique: false
          }
        );

      }

    };


    /* --------------------------------------------------------
       Success
    -------------------------------------------------------- */

    request.onsuccess = () => {

      const db =
        request.result;


      /*
       * If another tab upgrades the database,
       * close this connection so it doesn't block it.
       */

      db.onversionchange = () => {

        db.close();

      };


      resolve(db);

    };


    /* --------------------------------------------------------
       Error
    -------------------------------------------------------- */

    request.onerror = () => {

      reject(
        request.error ||
        new Error(
          "Could not open Pocket Planner database."
        )
      );

    };


    /* --------------------------------------------------------
       Blocked
    -------------------------------------------------------- */

    request.onblocked = () => {

      console.warn(
        "Pocket Planner database upgrade is blocked by another open tab."
      );

    };

  });

}


/* ============================================================
   3. RUN TRANSACTION
============================================================ */

async function runTransaction(
  mode,
  callback
) {

  const db =
    await openDatabase();


  return new Promise(
    (resolve, reject) => {

      let result;


      const transaction =
        db.transaction(
          TASK_STORE,
          mode
        );


      const store =
        transaction.objectStore(
          TASK_STORE
        );


      try {

        result =
          callback(
            store,
            transaction
          );

      } catch (error) {

        try {

          transaction.abort();

        } catch {
          /*
           * Transaction may already have finished.
           */
        }


        db.close();

        reject(error);

        return;

      }


      transaction.oncomplete =
        () => {

          db.close();

          resolve(result);

        };


      transaction.onerror =
        () => {

          const error =
            transaction.error ||
            new Error(
              "IndexedDB transaction failed."
            );


          db.close();

          reject(error);

        };


      transaction.onabort =
        () => {

          const error =
            transaction.error ||
            new Error(
              "IndexedDB transaction was aborted."
            );


          db.close();

          reject(error);

        };

    }
  );

}


/* ============================================================
   4. VALIDATE TASK
============================================================ */

function validateTask(task) {

  if (
    !task ||
    typeof task !== "object"
  ) {

    throw new TypeError(
      "Task must be an object."
    );

  }


  if (
    typeof task.id !== "string" ||
    task.id.length === 0
  ) {

    throw new TypeError(
      "Task must contain a valid id."
    );

  }


  if (
    typeof task.title !== "string" ||
    task.title.trim().length === 0
  ) {

    throw new TypeError(
      "Task must contain a title."
    );

  }


  /*
   * Defensive copy.
   *
   * This prevents callers from mutating the exact object
   * we're writing while the IndexedDB request is underway.
   */

  return {

    ...task,

    id:
      task.id,

    title:
      task.title
        .trim()
        .slice(0, 160),

    notes:
      typeof task.notes === "string"
        ? task.notes.slice(0, 4000)
        : "",

    dueAt:
      task.dueAt || null,

    priority:
      task.priority || "normal",

    reminderMinutes:
      Number.isFinite(
        task.reminderMinutes
      )
        ? task.reminderMinutes
        : null,

    repeat:
      task.repeat || "none",

    status:
      task.status || "todo",

    completedAt:
      task.completedAt || null,

    tags:
      Array.isArray(task.tags)
        ? task.tags
            .filter(
              tag =>
                typeof tag === "string"
            )
            .map(
              tag =>
                tag
                  .trim()
                  .toLowerCase()
                  .slice(0, 40)
            )
            .filter(Boolean)
            .slice(0, 20)
        : [],

    assigneeUsername:
      typeof task.assigneeUsername ===
        "string"
        ? task.assigneeUsername
            .trim()
            .toLowerCase()
            .replace(/^@/, "")
            .slice(0, 50)
        : null,

    createdAt:
      task.createdAt ||
      new Date().toISOString(),

    updatedAt:
      task.updatedAt ||
      new Date().toISOString()

  };

}


/* ============================================================
   5. PUT TASK
============================================================ */

async function putTask(task) {

  const safeTask =
    validateTask(task);


  return runTransaction(
    "readwrite",
    store => {

      store.put(
        safeTask
      );


      return safeTask;

    }
  );

}


/* ============================================================
   6. GET TASK
============================================================ */

async function getTask(id) {

  if (
    typeof id !== "string" ||
    !id
  ) {

    return null;

  }


  const db =
    await openDatabase();


  return new Promise(
    (resolve, reject) => {

      const transaction =
        db.transaction(
          TASK_STORE,
          "readonly"
        );


      const store =
        transaction.objectStore(
          TASK_STORE
        );


      const request =
        store.get(id);


      request.onsuccess =
        () => {

          const result =
            request.result || null;


          db.close();

          resolve(result);

        };


      request.onerror =
        () => {

          const error =
            request.error ||
            new Error(
              "Could not read task."
            );


          db.close();

          reject(error);

        };

    }
  );

}


/* ============================================================
   7. GET ALL TASKS
============================================================ */

async function getAllTasks() {

  const db =
    await openDatabase();


  return new Promise(
    (resolve, reject) => {

      const transaction =
        db.transaction(
          TASK_STORE,
          "readonly"
        );


      const store =
        transaction.objectStore(
          TASK_STORE
        );


      const request =
        store.getAll();


      request.onsuccess =
        () => {

          const tasks =
            Array.isArray(
              request.result
            )
              ? request.result
              : [];


          db.close();


          /*
           * Return a deterministic order.
           *
           * app.js performs the actual view-specific sorting,
           * but stable storage reads make debugging easier.
           */

          tasks.sort(
            (a, b) => {

              const aCreated =
                Date.parse(
                  a.createdAt || 0
                );


              const bCreated =
                Date.parse(
                  b.createdAt || 0
                );


              return (
                aCreated -
                bCreated
              );

            }
          );


          resolve(tasks);

        };


      request.onerror =
        () => {

          const error =
            request.error ||
            new Error(
              "Could not load tasks."
            );


          db.close();

          reject(error);

        };

    }
  );

}


/* ============================================================
   8. DELETE TASK
============================================================ */

async function deleteTask(id) {

  if (
    typeof id !== "string" ||
    !id
  ) {

    throw new TypeError(
      "A valid task id is required."
    );

  }


  return runTransaction(
    "readwrite",
    store => {

      store.delete(id);

      return id;

    }
  );

}


/* ============================================================
   9. CLEAR ALL TASKS
============================================================ */

async function clearTasks() {

  return runTransaction(
    "readwrite",
    store => {

      store.clear();

      return true;

    }
  );

}


/* ============================================================
   10. COUNT TASKS
============================================================ */

async function countTasks() {

  const db =
    await openDatabase();


  return new Promise(
    (resolve, reject) => {

      const transaction =
        db.transaction(
          TASK_STORE,
          "readonly"
        );


      const store =
        transaction.objectStore(
          TASK_STORE
        );


      const request =
        store.count();


      request.onsuccess =
        () => {

          const count =
            Number(
              request.result || 0
            );


          db.close();

          resolve(count);

        };


      request.onerror =
        () => {

          const error =
            request.error ||
            new Error(
              "Could not count tasks."
            );


          db.close();

          reject(error);

        };

    }
  );

}


/* ============================================================
   11. GET TASKS BY STATUS
============================================================ */

async function getTasksByStatus(
  status
) {

  if (
    typeof status !== "string" ||
    !status
  ) {

    return [];

  }


  const db =
    await openDatabase();


  return new Promise(
    (resolve, reject) => {

      const transaction =
        db.transaction(
          TASK_STORE,
          "readonly"
        );


      const store =
        transaction.objectStore(
          TASK_STORE
        );


      const index =
        store.index(
          "status"
        );


      const request =
        index.getAll(status);


      request.onsuccess =
        () => {

          const result =
            Array.isArray(
              request.result
            )
              ? request.result
              : [];


          db.close();

          resolve(result);

        };


      request.onerror =
        () => {

          const error =
            request.error ||
            new Error(
              "Could not query tasks."
            );


          db.close();

          reject(error);

        };

    }
  );

}


/* ============================================================
   12. EXPORT DATABASE API

   app.js accesses the database through:

   window.PocketPlannerDB.getAllTasks()
   window.PocketPlannerDB.putTask()
   window.PocketPlannerDB.deleteTask()

   Keeping one public namespace avoids spraying database
   functions across window.
============================================================ */

window.PocketPlannerDB =
  Object.freeze({

    getAllTasks,

    getTask,

    putTask,

    deleteTask,

    clearTasks,

    countTasks,

    getTasksByStatus

  });
