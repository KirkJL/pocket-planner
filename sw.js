"use strict";

/* ============================================================
   POCKET PLANNER
   sw.js

   Service Worker responsibilities:

   - Cache the PWA application shell
   - Allow the planner UI to open offline
   - Serve cached static assets when offline
   - Receive Web Push notifications
   - Display reminder notifications
   - Handle notification clicks

   IMPORTANT:
   The Service Worker does NOT schedule reminders.

   Reminder scheduling belongs to the Cloudflare Durable Object.
   The Durable Object wakes at the correct time and sends a
   Web Push message to this Service Worker.
============================================================ */


/* ============================================================
   1. CACHE CONFIGURATION

   IMPORTANT:
   Change CACHE_VERSION whenever you make a significant frontend
   deployment and need old cached assets removed.
============================================================ */

const CACHE_VERSION = "v1";

const CACHE_NAME =
  `pocket-planner-${CACHE_VERSION}`;


/* ============================================================
   2. APPLICATION SHELL

   All paths are relative because Pocket Planner is hosted under:

   https://USERNAME.github.io/PocketPlanner/

   rather than necessarily at the root of the domain.
============================================================ */

const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./db.js",
  "./manifest.webmanifest"
];


/* ============================================================
   3. INSTALL

   Cache the minimum application shell required for Pocket
   Planner to launch without a network connection.
============================================================ */

self.addEventListener(
  "install",
  event => {

    event.waitUntil(
      installApplication()
    );

  }
);


async function installApplication() {

  const cache =
    await caches.open(
      CACHE_NAME
    );


  /*
   * Cache files individually rather than using cache.addAll().
   *
   * Why?
   *
   * addAll() fails the entire installation if one optional
   * resource fails.
   *
   * Individual requests make deployment more resilient while
   * we're still adding assets such as icons.
   */

  for (
    const resource of
    APP_SHELL
  ) {

    try {

      await cache.add(
        resource
      );

    } catch (error) {

      console.warn(
        "[Pocket Planner SW] Could not cache:",
        resource,
        error
      );

    }

  }


  /*
   * Activate the new worker without waiting for every existing
   * Pocket Planner tab to close.
   */

  await self.skipWaiting();

}


/* ============================================================
   4. ACTIVATE

   Delete obsolete Pocket Planner caches.
============================================================ */

self.addEventListener(
  "activate",
  event => {

    event.waitUntil(
      activateApplication()
    );

  }
);


async function activateApplication() {

  const cacheNames =
    await caches.keys();


  await Promise.all(

    cacheNames.map(
      cacheName => {

        /*
         * Only touch our own caches.
         *
         * Never indiscriminately delete every cache belonging
         * to the origin.
         */

        if (
          cacheName.startsWith(
            "pocket-planner-"
          ) &&
          cacheName !==
            CACHE_NAME
        ) {

          return caches.delete(
            cacheName
          );

        }


        return Promise.resolve(
          false
        );

      }
    )

  );


  /*
   * Immediately control existing pages.
   */

  await self.clients.claim();

}


/* ============================================================
   5. FETCH HANDLER
============================================================ */

self.addEventListener(
  "fetch",
  event => {

    const request =
      event.request;


    /*
     * Only intercept GET requests.
     *
     * API POST/PUT/DELETE calls must never be accidentally
     * cached by the Service Worker.
     */

    if (
      request.method !== "GET"
    ) {

      return;

    }


    const url =
      new URL(
        request.url
      );


    /*
     * Only cache resources belonging to the GitHub Pages
     * origin.
     *
     * Cloudflare API requests and external APIs must remain
     * network-controlled.
     */

    if (
      url.origin !==
      self.location.origin
    ) {

      return;

    }


    /*
     * HTML navigation requests:
     *
     * Network first.
     *
     * This means users receive the newest app when online,
     * but Pocket Planner still opens when offline.
     */

    if (
      request.mode ===
      "navigate"
    ) {

      event.respondWith(
        handleNavigationRequest(
          request
        )
      );

      return;

    }


    /*
     * Static assets:
     *
     * Stale-while-revalidate.
     *
     * Cached copy is returned immediately while a fresh copy
     * is fetched in the background.
     */

    event.respondWith(
      handleStaticRequest(
        request
      )
    );

  }
);


/* ============================================================
   6. NAVIGATION REQUEST

   Strategy:
   Network first -> cache fallback -> cached index.html
============================================================ */

async function handleNavigationRequest(
  request
) {

  try {

    const response =
      await fetch(request);


    if (
      response &&
      response.ok
    ) {

      const cache =
        await caches.open(
          CACHE_NAME
        );


      /*
       * Clone because Response bodies can only be consumed once.
       */

      await cache.put(
        request,
        response.clone()
      );

    }


    return response;


  } catch (error) {

    const cachedRequest =
      await caches.match(
        request
      );


    if (cachedRequest) {

      return cachedRequest;

    }


    /*
     * Fall back to Pocket Planner's cached application entry
     * point.
     */

    const cachedIndex =
      await caches.match(
        "./index.html"
      );


    if (cachedIndex) {

      return cachedIndex;

    }


    /*
     * Last resort.
     */

    return new Response(
      `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1"
        >
        <title>Pocket Planner Offline</title>
      </head>

      <body
        style="
          margin:0;
          min-height:100vh;
          display:grid;
          place-items:center;
          padding:24px;
          background:#050b14;
          color:#f4f7fb;
          font-family:system-ui,sans-serif;
          text-align:center;
        "
      >

        <main>

          <h1>
            Pocket Planner
          </h1>

          <p>
            You're offline and the application shell
            hasn't been cached yet.
          </p>

          <p>
            Open Pocket Planner once while online and
            it'll be available offline afterwards.
          </p>

        </main>

      </body>
      </html>
      `,
      {
        status: 503,

        headers: {
          "Content-Type":
            "text/html; charset=utf-8"
        }
      }
    );

  }

}


/* ============================================================
   7. STATIC REQUEST

   Strategy:
   Cache immediately -> refresh cache from network.
============================================================ */

async function handleStaticRequest(
  request
) {

  const cached =
    await caches.match(
      request
    );


  const networkPromise =
    fetch(request)
      .then(
        async response => {

          /*
           * Only cache successful normal responses.
           */

          if (
            response &&
            response.ok &&
            response.type ===
              "basic"
          ) {

            const cache =
              await caches.open(
                CACHE_NAME
              );


            await cache.put(
              request,
              response.clone()
            );

          }


          return response;

        }
      )
      .catch(
        error => {

          console.warn(
            "[Pocket Planner SW] Network request failed:",
            request.url,
            error
          );


          return null;

        }
      );


  /*
   * Cached copy exists:
   *
   * return it immediately while networkPromise updates cache.
   */

  if (cached) {

    return cached;

  }


  /*
   * No cached copy:
   *
   * wait for network.
   */

  const networkResponse =
    await networkPromise;


  if (networkResponse) {

    return networkResponse;

  }


  return new Response(
    "Offline",
    {
      status: 503,

      headers: {
        "Content-Type":
          "text/plain; charset=utf-8"
      }
    }
  );

}


/* ============================================================
   8. WEB PUSH

   This is the important part for real reminders.

   Later:

   Durable Object alarm
           ↓
   Cloudflare Worker
           ↓
   Web Push
           ↓
   Browser push service
           ↓
   THIS EVENT
           ↓
   showNotification()

   Expected push payload:

   {
     "type": "task",
     "title": "Pocket Planner",
     "body": "Take the bins out",
     "taskId": "uuid",
     "url": "./?task=uuid"
   }

   Morning Brief example:

   {
     "type": "morning-brief",
     "title": "Morning Brief",
     "body": "12°C · Rain likely at 08:00 · 4 tasks today",
     "url": "./?brief=1"
   }
============================================================ */

self.addEventListener(
  "push",
  event => {

    event.waitUntil(
      handlePushEvent(event)
    );

  }
);


async function handlePushEvent(
  event
) {

  let payload = {};


  /*
   * Never assume the incoming push contains valid JSON.
   */

  if (event.data) {

    try {

      payload =
        event.data.json();

    } catch {

      try {

        payload = {
          body:
            event.data.text()
        };

      } catch {

        payload = {};

      }

    }

  }


  const title =
    sanitizeNotificationText(
      payload.title,
      100
    ) ||
    "Pocket Planner";


  const body =
    sanitizeNotificationText(
      payload.body,
      500
    ) ||
    "You have a reminder.";


  const taskId =
    typeof payload.taskId ===
      "string"
      ? payload.taskId.slice(
          0,
          100
        )
      : null;


  const type =
    typeof payload.type ===
      "string"
      ? payload.type.slice(
          0,
          50
        )
      : "reminder";


  const targetUrl =
    safeNotificationUrl(
      payload.url,
      taskId,
      type
    );


  const options = {

    body,

    /*
     * We'll swap these to PNG once the actual PWA icons
     * are generated.
     */

    icon:
      "./icons/icon-192.png",

    badge:
      "./icons/icon-192.png",

    tag:
      taskId
        ? `task-${taskId}`
        : `pocket-planner-${type}`,

    /*
     * Replace an existing notification for the same task
     * instead of stacking duplicates.
     */

    renotify: false,

    data: {

      url:
        targetUrl,

      taskId,

      type

    }

  };


  await self.registration
    .showNotification(
      title,
      options
    );

}


/* ============================================================
   9. NOTIFICATION CLICK
============================================================ */

self.addEventListener(
  "notificationclick",
  event => {

    event.notification.close();


    event.waitUntil(
      handleNotificationClick(
        event.notification
      )
    );

  }
);


async function handleNotificationClick(
  notification
) {

  const data =
    notification.data || {};


  const targetUrl =
    safeNotificationUrl(
      data.url,
      data.taskId,
      data.type
    );


  /*
   * Build an absolute URL within the current GitHub Pages
   * application scope.
   */

  const absoluteTarget =
    new URL(
      targetUrl,
      self.registration.scope
    ).href;


  const clientList =
    await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true
    });


  /*
   * If Pocket Planner is already open, reuse it.
   */

  for (
    const client of
    clientList
  ) {

    try {

      const clientUrl =
        new URL(
          client.url
        );


      const target =
        new URL(
          absoluteTarget
        );


      if (
        clientUrl.origin ===
          target.origin &&
        clientUrl.pathname ===
          target.pathname
      ) {

        /*
         * Navigate the existing client so query parameters such
         * as ?task=... or ?brief=1 reach app.js.
         */

        if (
          "navigate" in client
        ) {

          await client.navigate(
            absoluteTarget
          );

        }


        if (
          "focus" in client
        ) {

          return client.focus();

        }

      }

    } catch (error) {

      console.warn(
        "[Pocket Planner SW] Could not reuse client:",
        error
      );

    }

  }


  /*
   * Otherwise open a fresh Pocket Planner window.
   */

  if (
    self.clients.openWindow
  ) {

    return self.clients.openWindow(
      absoluteTarget
    );

  }


  return undefined;

}


/* ============================================================
   10. NOTIFICATION CLOSE

   Nothing is sent anywhere yet.

   We keep this event so later we can optionally record
   notification dismissal locally/server-side without changing
   the Service Worker structure.
============================================================ */

self.addEventListener(
  "notificationclose",
  event => {

    const data =
      event.notification.data || {};


    console.debug(
      "[Pocket Planner SW] Notification dismissed:",
      data.type || "unknown"
    );

  }
);


/* ============================================================
   11. MESSAGE HANDLER

   Allows app.js to communicate with the Service Worker.

   Currently supported:

   {
     type: "SKIP_WAITING"
   }
============================================================ */

self.addEventListener(
  "message",
  event => {

    if (
      !event.data ||
      typeof event.data !==
        "object"
    ) {

      return;

    }


    if (
      event.data.type ===
      "SKIP_WAITING"
    ) {

      self.skipWaiting();

    }

  }
);


/* ============================================================
   12. SAFE NOTIFICATION URL

   SECURITY:

   Never allow a push payload to make the Service Worker open
   arbitrary external URLs.

   Otherwise a compromised backend/payload could turn reminder
   notifications into phishing redirects.

   We only permit relative URLs within Pocket Planner.
============================================================ */

function safeNotificationUrl(
  suppliedUrl,
  taskId,
  type
) {

  if (
    typeof suppliedUrl ===
      "string"
  ) {

    const trimmed =
      suppliedUrl.trim();


    /*
     * Reject:
     *
     * https://
     * http://
     * //
     * javascript:
     * data:
     * etc.
     */

    if (
      trimmed.startsWith("./") ||
      trimmed.startsWith("?")
    ) {

      return trimmed.slice(
        0,
        500
      );

    }

  }


  if (
    taskId
  ) {

    return (
      `./?task=` +
      encodeURIComponent(
        taskId
      )
    );

  }


  if (
    type ===
      "morning-brief"
  ) {

    return "./?brief=1";

  }


  return "./";

}


/* ============================================================
   13. NOTIFICATION TEXT SANITISATION

   Notifications are rendered as plain text by the browser,
   but we still constrain input length and remove control
   characters.
============================================================ */

function sanitizeNotificationText(
  value,
  maxLength
) {

  if (
    typeof value !==
      "string"
  ) {

    return "";

  }


  return value
    .replace(
      /[\u0000-\u001F\u007F]/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim()
    .slice(
      0,
      maxLength
    );

}
