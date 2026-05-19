import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyBuuD5Vf-GXlTYuzt7H9yrjPqvtTZCdumA",
  authDomain: "sistema-clinica-3a167.firebaseapp.com",
  projectId: "sistema-clinica-3a167",
  storageBucket: "sistema-clinica-3a167.firebasestorage.app",
  messagingSenderId: "278003358478",
  appId: "1:278003358478:web:f1930ee6c95f65e9afd55f",
  measurementId: "G-WYKWN5W0L0",
};

const app = initializeApp(firebaseConfig);
export const messaging = getMessaging(app);

export const solicitarPermisoNotificaciones = async () => {
  try {
    const permiso = await Notification.requestPermission();

    if (permiso !== "granted") {
      console.log("Permiso denegado");
      return null;
    }

    const swRegistration = await navigator.serviceWorker.register(
      "/firebase-messaging-sw.js"
    );

    const token = await getToken(messaging, {
      vapidKey: "BEvqkbPaetVGMsTQcUa4xsOB2cf_4P_qSS5sgfzz6Hv2CQ6se30g1nesX8-pOQU9tXrBaUI1IX5EjVvtOOz6plY",
      serviceWorkerRegistration: swRegistration,
    });

    console.log("TOKEN FIREBASE:", token);
    return token;
  } catch (error) {
    console.error("Error obteniendo token:", error);
    return null;
  }
};

export const escucharMensajesForeground = (callback) => {
  return onMessage(messaging, callback);
};