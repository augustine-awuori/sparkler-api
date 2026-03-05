import { Expo } from "expo-server-sdk";

export async function sendPushNotificationTo(
  usersToken = [],
  { message, title, ...otherData },
) {
  try {
    await sendPushNotification(usersToken, { message, title, ...otherData });
  } catch (error) {
    console.error(`Error sending push notifications: ${error}`);
  }
}

async function sendPushNotification(
  targetExpoPushToken,
  { message, title, ...otherData },
) {
  const expo = new Expo();
  const chunks = expo.chunkPushNotifications([
    {
      to: targetExpoPushToken,
      sound: "default",
      body: message,
      title,
      ...otherData,
    },
  ]);

  const sendChunks = async () => {
    chunks.forEach(async (chunk) => {
      try {
        await expo.sendPushNotificationsAsync(chunk);
      } catch (error) {
        console.error(`Error sending chunk...`, error);
      }
    });
  };

  await sendChunks();
}

export default sendPushNotification;
