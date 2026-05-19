importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBuuD5Vf-GXlTYuzt7H9yrjPqvtTZCdumA",
  authDomain: "sistema-clinica-3a167.firebaseapp.com",
  projectId: "sistema-clinica-3a167",
  storageBucket: "sistema-clinica-3a167.firebasestorage.app",
  messagingSenderId: "278003358478",
  appId: "1:278003358478:web:f1930ee6c95f65e9afd55f",
  measurementId: "G-WYKWN5W0L0",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  self.registration.showNotification(payload?.notification?.title || "Nueva notificación", {
    body: payload?.notification?.body || "Hay una nueva actualización.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: payload?.data || {},
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow("/"));
});