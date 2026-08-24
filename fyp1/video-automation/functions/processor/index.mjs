import { extname } from "node:path";
import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { CreateJobCommand, MediaConvertClient } from "@aws-sdk/client-mediaconvert";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { buildJobSettings } from "./job-settings.mjs";
import { normaliseKey, safeText, titleFromStem, videoIdentity } from "./helpers.mjs";

const s3 = new S3Client({ maxAttempts: 3 });
const mediaConvert = new MediaConvertClient({ maxAttempts: 3 });
const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({ maxAttempts: 3 }), {
  marshallOptions: { removeUndefinedValues: true }
});

const requiredEnvironment = [
  "SOURCE_BUCKET",
  "OUTPUT_BUCKET",
  "VIDEOS_TABLE",
  "MEDIACONVERT_ROLE_ARN"
];

function validateEnvironment() {
  for (const name of requiredEnvironment) {
    if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
  }
}

function tagsFromMetadata(tags) {
  return String(tags || "")
    .split(",")
    .map((tag) => safeText(tag, "", 32).toLowerCase())
    .filter(Boolean)
    .slice(0, 12);
}

async function markFailed(videoId, message) {
  await documentClient.send(new UpdateCommand({
    TableName: process.env.VIDEOS_TABLE,
    Key: { videoId },
    UpdateExpression: "SET #status = :status, errorMessage = :message, updatedAt = :updatedAt",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: {
      ":status": "FAILED",
      ":message": safeText(message, "MediaConvert submission failed", 500),
      ":updatedAt": new Date().toISOString()
    }
  }));
}

export const handler = async (event) => {
  validateEnvironment();
  const bucket = event?.detail?.bucket?.name;
  const key = normaliseKey(event?.detail?.object?.key);
  const etag = String(event?.detail?.object?.etag || event?.detail?.object?.eTag || "");

  if (bucket !== process.env.SOURCE_BUCKET || !key.startsWith("incoming/") || extname(key).toLowerCase() !== ".mp4") {
    console.log(JSON.stringify({ action: "ignored", bucket, key }));
    return { ignored: true };
  }

  const { sourceStem, videoId } = videoIdentity(key);
  const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  const metadata = head.Metadata || {};
  const title = safeText(metadata.title, titleFromStem(sourceStem), 120);
  const category = safeText(metadata.category, "Uncategorised", 60);
  const description = safeText(metadata.description, "Automatically published underwater video.", 500);
  const tags = tagsFromMetadata(metadata.tags);
  const now = new Date().toISOString();

  try {
    await documentClient.send(new PutCommand({
      TableName: process.env.VIDEOS_TABLE,
      Item: {
        videoId,
        streamKey: videoId,
        title,
        category,
        description,
        tags,
        duration: "Processing",
        status: "PROCESSING",
        sourceBucket: bucket,
        sourceKey: key,
        sourceStem,
        sourceETag: etag,
        createdAt: now,
        updatedAt: now
      },
      ConditionExpression: "attribute_not_exists(videoId) OR sourceETag <> :etag",
      ExpressionAttributeValues: { ":etag": etag }
    }));
  } catch (error) {
    if (error?.name === "ConditionalCheckFailedException") {
      console.log(JSON.stringify({ action: "duplicate_ignored", videoId, key, etag }));
      return { duplicate: true, videoId };
    }
    throw error;
  }

  try {
    const sourceUri = `s3://${bucket}/${key}`;
    const hlsDestination = `s3://${process.env.OUTPUT_BUCKET}/hls/${videoId}/`;
    const thumbnailDestination = `s3://${process.env.OUTPUT_BUCKET}/thumbnails/${videoId}/`;
    const response = await mediaConvert.send(new CreateJobCommand({
      Role: process.env.MEDIACONVERT_ROLE_ARN,
      Settings: buildJobSettings({ sourceUri, hlsDestination, thumbnailDestination }),
      StatusUpdateInterval: "SECONDS_60",
      UserMetadata: {
        publisher: "blue-current-auto",
        videoId
      }
    }));
    const jobId = response.Job?.Id;
    if (!jobId) throw new Error("MediaConvert returned no job ID");

    await documentClient.send(new UpdateCommand({
      TableName: process.env.VIDEOS_TABLE,
      Key: { videoId },
      UpdateExpression: "SET mediaConvertJobId = :jobId, updatedAt = :updatedAt",
      ExpressionAttributeValues: { ":jobId": jobId, ":updatedAt": new Date().toISOString() }
    }));
    console.log(JSON.stringify({ action: "job_submitted", videoId, key, jobId }));
    return { videoId, jobId };
  } catch (error) {
    await markFailed(videoId, error?.message);
    throw error;
  }
};
