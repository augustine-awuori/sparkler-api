import * as stream from "getstream";

export function getClient() {
    return stream.connect(
        process.env.feedApiKey,
        process.env.feedSecretKey,
        process.env.streamAppId
    );
}

export function getTargetFeeds(actorId) {
    return [`notification:${actorId}`];
}

export async function addReaction({
    kind,
    sparkleId,
    actorId,
    targetFeeds,
    userId,
    data = {},
}) {
    try {
        const client = getClient();
        if (!client) return { ok: false, data: "Client not initialized" };

        const resData = await client.reactions.add(
            kind,
            sparkleId,
            { id: actorId, ...data },
            { targetFeeds, userId }
        );
        return { ok: true, data: resData };
    } catch (error) {
        return { ok: false, data: error };
    }
}

export function getEATZone() {
    return new Date(new Date().getTime() + 3 * 60 * 60 * 1000).toISOString();
}