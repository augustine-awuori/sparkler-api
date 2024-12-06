import * as stream from "getstream";

export function getClient() {
    return stream.connect(
        process.env.feedApiKey,
        process.env.feedSecretKey,
        process.env.streamAppId
    );
}