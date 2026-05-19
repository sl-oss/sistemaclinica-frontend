import { initializeApp } from "firebase/app";
import {
  getMessaging,
  getToken,
  onMessage,
} from "firebase/messaging";

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

    const token = await getToken(messaging, {
      vapidKey:
        "T75zlnj3CA5a8pOa_Y2EQNie70-YqQduwj-9Av4QUms",
    });

    console.log("TOKEN FIREBASE:", token);

    return token;
  } catch (error) {
    console.error("Error obteniendo token:", error);
    return null;
  }
};

export const escucharMensajesForeground = () =>
  new Promise((resolve) => {
    onMessage(messaging, (payload) => {
      resolve(payload);
    });
  });