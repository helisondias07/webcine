import config from "../config.ts";
import admin from "firebase-admin";
import {
  getDefaultBillingProfile,
  getEntitlementsForPlan,
  normalizePlan,
  normalizeSubscriptionStatus,
  type SubscriptionStatus,
  type UserBillingProfile,
  type UserPlan,
} from "./entitlements.ts";

if (config.FIREBASE_ADMIN_SDK_CONFIG) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(config.FIREBASE_ADMIN_SDK_CONFIG),
    ),
    databaseURL: config.FIREBASE_DATABASE_URL,
  });
}

export async function validateUserToken(uid: string, token: string) {
  if (!config.FIREBASE_ADMIN_SDK_CONFIG) {
    return undefined;
  }
  if (!token) {
    return undefined;
  }
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    if (uid !== decoded.uid) {
      // Valid but for wrong user
      return undefined;
    }
    return decoded;
  } catch (e) {
    // Promise rejects if verification failed
    console.log(e);
    return undefined;
  }
}

export async function writeData(key: string, value: string) {
  if (!config.FIREBASE_ADMIN_SDK_CONFIG) {
    return;
  }
  await admin.database().ref(key).set(value);
}

export async function getUserByEmail(email: string) {
  if (!config.FIREBASE_ADMIN_SDK_CONFIG) {
    return null;
  }
  try {
    return await admin.auth().getUserByEmail(email);
  } catch (e: any) {
    console.log(email, e.message);
  }
  return null;
}

export async function getUser(uid: string) {
  if (!config.FIREBASE_ADMIN_SDK_CONFIG) {
    return null;
  }
  return await admin.auth().getUser(uid);
}

export async function getUserEmail(uid: string) {
  if (!config.FIREBASE_ADMIN_SDK_CONFIG) {
    return null;
  }
  const user = await admin.auth().getUser(uid);
  return user.email;
}

export async function deleteUser(uid: string) {
  if (!config.FIREBASE_ADMIN_SDK_CONFIG) {
    return null;
  }
  return admin.auth().deleteUser(uid);
}

function getFirestore() {
  if (!config.FIREBASE_ADMIN_SDK_CONFIG || admin.apps.length === 0) {
    return undefined;
  }
  return admin.firestore();
}

type BillingProfileWrite = Partial<{
  plan: UserPlan;
  subscriptionStatus: SubscriptionStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}>;

export async function getUserBillingProfile(
  uid: string,
): Promise<UserBillingProfile> {
  const db = getFirestore();
  if (!db || !uid) {
    return getDefaultBillingProfile();
  }
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) {
    return getDefaultBillingProfile();
  }
  const data = snap.data() ?? {};
  const plan = normalizePlan(String(data.plan ?? "free"));
  const subscriptionStatus = normalizeSubscriptionStatus(
    String(data.subscriptionStatus ?? "canceled"),
  );
  return {
    plan,
    subscriptionStatus,
    stripeCustomerId:
      typeof data.stripeCustomerId === "string" ? data.stripeCustomerId : null,
    stripeSubscriptionId:
      typeof data.stripeSubscriptionId === "string"
        ? data.stripeSubscriptionId
        : null,
    entitlements: getEntitlementsForPlan(plan),
  };
}

export async function upsertUserBillingProfile(
  uid: string,
  payload: BillingProfileWrite,
) {
  const db = getFirestore();
  if (!db || !uid) {
    return;
  }
  const plan = normalizePlan(payload.plan ?? "free");
  const subscriptionStatus = normalizeSubscriptionStatus(
    payload.subscriptionStatus ?? "canceled",
  );
  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  await ref.set(
    {
      plan,
      subscriptionStatus,
      stripeCustomerId: payload.stripeCustomerId ?? null,
      stripeSubscriptionId: payload.stripeSubscriptionId ?? null,
      entitlements: getEntitlementsForPlan(plan),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(snap.exists
        ? {}
        : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
    },
    { merge: true },
  );
}

export async function setStripeCustomerOwner(customerId: string, uid: string) {
  const db = getFirestore();
  if (!db || !customerId || !uid) {
    return;
  }
  await db
    .collection("stripeCustomers")
    .doc(customerId)
    .set(
      {
        uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}

export async function getUidByStripeCustomerId(customerId: string) {
  const db = getFirestore();
  if (!db || !customerId) {
    return undefined;
  }
  const snap = await db.collection("stripeCustomers").doc(customerId).get();
  const uid = snap.data()?.uid;
  return typeof uid === "string" ? uid : undefined;
}

export async function hasProcessedStripeEvent(eventId: string) {
  const db = getFirestore();
  if (!db || !eventId) {
    return false;
  }
  const snap = await db.collection("stripeWebhookEvents").doc(eventId).get();
  return snap.exists;
}

export async function markStripeEventProcessed(eventId: string, type: string) {
  const db = getFirestore();
  if (!db || !eventId) {
    return;
  }
  await db.collection("stripeWebhookEvents").doc(eventId).set(
    {
      type,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}
