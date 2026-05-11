import type firebase from "firebase/compat/app";
import config from "../config";

let firebasePromise: Promise<typeof firebase> | undefined;

export async function getFirebaseClient() {
  if (!firebasePromise) {
    firebasePromise = Promise.all([
      import("firebase/compat/app"),
      import("firebase/compat/auth"),
    ]).then(([firebaseModule]) => {
      const firebaseClient = firebaseModule.default;
      const firebaseConfig = config.VITE_FIREBASE_CONFIG;
      if (!firebaseClient.apps.length) {
        if (!firebaseConfig) {
          const error = new Error("Firebase client config is missing") as Error & {
            code?: string;
          };
          error.code = "auth/missing-client-config";
          throw error;
        }
        firebaseClient.initializeApp(JSON.parse(firebaseConfig));
      }
      return firebaseClient;
    });
  }
  return firebasePromise;
}

export type FirebaseUser = firebase.User;
export type FirebaseUnsubscribe = firebase.Unsubscribe;
