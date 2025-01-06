import { Expo } from "expo-server-sdk";

const sendPushNotification = async (targetExpoPushToken, message) => {
    const expo = new Expo();
    const chunks = expo.chunkPushNotifications([
        { to: targetExpoPushToken, sound: "default", body: message },
    ]);

    const sendChunks = async () => {
        chunks.forEach(async chunk => {
            try {
                await expo.sendPushNotificationsAsync(chunk)
            } catch (error) {
                console.error(`Error sending chunk...`, error);
            }
        })
    };

    await sendChunks();
};

export default sendPushNotification;