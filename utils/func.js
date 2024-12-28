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

export async function getUserReactions({ kind, userId }) {
    try {
        const client = getClient();
        if (!client) return { ok: false, data: "Client not initialized" };

        const res = await client.reactions.filter({
            kind,
            with_activity_data: true,
            with_own_children: true,
            filter_user_id: userId,
            user_id: userId,
        });

        return {
            ok: !!res,
            data: res || "Something failed while fetching reactions",
        };
    } catch (error) {
        return { ok: false, data: error };
    }
}

export async function removeReaction({ sparkleId, kind, userId }) {
    try {
        const client = getClient();
        if (!client) return { ok: false, data: "Client not initialized" };

        const response = await client.reactions.filter({
            activity_id: sparkleId,
            kind,
            user_id: userId,
        });
        if (response.results.length === 0)
            return { ok: false, data: "Reaction not found" };

        const reactionId = response.results[0].id;
        await client.reactions.delete(reactionId);

        return { ok: true, data: response };
    } catch (error) {
        return { ok: false, data: error };
    }
}
