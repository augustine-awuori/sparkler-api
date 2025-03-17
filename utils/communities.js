import { Community } from "../models/community.js";
import { sendPushNotificationTo } from "../routes/expoPushNotifications.js";
import { User } from "../models/user.js";

async function getCommunityMembersPushToken(communityId, exception) {
    const community = await Community.findById(communityId);

    const membersPushToken = [];
    (community || { members: [] }).members.forEach(async (member) => {
        if (member === exception) return;

        const user = await User.findById(member);
        const token = user.expoPushToken?.data;
        if (token) membersPushToken.push(token);
    });

    return membersPushToken;
}

export async function notifyCommunityMembers(
    communityId,
    exception,
    { message, title }
) {
    const tokens = await getCommunityMembersPushToken(communityId, exception);

    sendPushNotificationTo(tokens, { message, title });
}
