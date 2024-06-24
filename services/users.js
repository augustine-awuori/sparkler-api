import stream from "getstream";

export function getUserFeedToken(userId) {
  return stream
    .connect(process.env.feedApiKey, process.env.feedSecretKey)
    .createUserToken(userId.toString());
}
