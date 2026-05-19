importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBuuD5Vf-GXlTYuzt7H9yrjPqvtTZCdumA",
  authDomain: "sistema-clinica-3a167.firebaseapp.com",
  projectId: "sistema-clinica-3a167",
  storageBucket: "sistema-clinica-3a167.firebasestorage.app",
  messagingSenderId: "278003358478",
  appId: "1:278003358478:web:f1930ee6c95f65e9afd55f",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log("[firebase-messaging-sw.js] Background message ", payload);

  const notificationTitle =
    payload.notification?.title || "Nueva notificación";

  const notificationOptions = {
    body:
      payload.notification?.body ||
      payload.data?.message ||
      "Nueva actualización",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    vibrate: [200, 100, 200],
    requireInteraction: true,
    data: payload.data || {},
  };

  self.registration.showNotification(
    notificationTitle,
    notificationOptions
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    }).then(function (clientList) {
      for (const client of clientList) {
        if ("focus" in client) {
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow("/");
      }
    })
  );
});