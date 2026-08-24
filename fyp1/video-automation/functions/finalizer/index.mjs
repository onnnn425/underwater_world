import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { formatDuration, longestOutputDuration } from "./helpers.mjs";

const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({ maxAttempts: 3 }), {
  marshallOptions: { removeUndefinedValues: true }
});

function safeError(detail) {
  const raw = detail?.errorMessage || detail?.messages?.[0]?.info || `MediaConvert job ${detail?.status || "failed"}`;
  return String(raw).replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 500);
}

export const handler = async (event) => {
  const detail = event?.detail || {};
  const metadata = detail.userMetadata || detail.UserMetadata || {};
  const videoId = metadata.videoId;
  const jobId = detail.jobId || detail.id;
  const status = detail.status;

  if (metadata.publisher !== "blue-current-auto" || !videoId || !jobId) {
    console.log(JSON.stringify({ action: "ignored", status, jobId, metadata }));
    return { ignored: true };
  }

  const common = {
    TableName: process.env.VIDEOS_TABLE,
    Key: { videoId },
    ConditionExpression: "mediaConvertJobId = :jobId",
    ExpressionAttributeNames: { "#status": "status", "#duration": "duration" }
  };

  try {
    if (status === "COMPLETE") {
      const record = await documentClient.send(new GetCommand({
        TableName: process.env.VIDEOS_TABLE,
        Key: { videoId },
        ProjectionExpression: "sourceStem"
      }));
      const sourceStem = record.Item?.sourceStem;
      if (!sourceStem) throw new Error(`Catalogue record ${videoId} has no sourceStem`);
      const encodedStem = encodeURIComponent(sourceStem);
      const baseUrl = `https://${process.env.CLOUDFRONT_DOMAIN}`;
      await documentClient.send(new UpdateCommand({
        ...common,
        UpdateExpression: "SET #status = :status, #duration = :duration, streamUrl = :streamUrl, image = :image, publishedAt = :publishedAt, updatedAt = :updatedAt REMOVE errorMessage",
        ExpressionAttributeValues: {
          ":jobId": jobId,
          ":status": "PUBLISHED",
          ":duration": formatDuration(longestOutputDuration(detail)),
          ":streamUrl": `${baseUrl}/hls/${videoId}/${encodedStem}.m3u8`,
          ":image": `${baseUrl}/thumbnails/${videoId}/${encodedStem}_thumb.0000000.jpg`,
          ":publishedAt": new Date().toISOString(),
          ":updatedAt": new Date().toISOString()
        }
      }));
      console.log(JSON.stringify({ action: "published", videoId, jobId }));
      return { videoId, published: true };
    }

    await documentClient.send(new UpdateCommand({
      ...common,
      UpdateExpression: "SET #status = :status, errorMessage = :message, updatedAt = :updatedAt",
      ExpressionAttributeValues: {
        ":jobId": jobId,
        ":status": "FAILED",
        ":message": safeError(detail),
        ":updatedAt": new Date().toISOString()
      }
    }));
    console.log(JSON.stringify({ action: "failed", videoId, jobId, status }));
    return { videoId, published: false };
  } catch (error) {
    if (error?.name === "ConditionalCheckFailedException") {
      console.log(JSON.stringify({ action: "stale_event_ignored", videoId, jobId }));
      return { stale: true, videoId };
    }
    throw error;
  }
};
