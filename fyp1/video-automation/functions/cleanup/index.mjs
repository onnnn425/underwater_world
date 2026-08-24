import { extname } from "node:path";
import {
  DeleteObjectsCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client
} from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DeleteCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { normaliseKey, videoIdentity } from "./helpers.mjs";

const s3 = new S3Client({ maxAttempts: 3 });
const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({ maxAttempts: 3 }));

function validateEnvironment() {
  for (const name of ["SOURCE_BUCKET", "OUTPUT_BUCKET", "VIDEOS_TABLE"]) {
    if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
  }
}

async function sourceExists(bucket, key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error) {
    if (error?.name === "NotFound" || error?.name === "NoSuchKey" || error?.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

async function deletePrefix(bucket, prefix) {
  let continuationToken;
  let deleted = 0;

  do {
    const page = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken
    }));
    const objects = (page.Contents || []).map(({ Key }) => ({ Key })).filter(({ Key }) => Key);
    if (objects.length) {
      const response = await s3.send(new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: objects, Quiet: true }
      }));
      if (response.Errors?.length) {
        throw new Error(`Failed to delete ${response.Errors.length} object(s) under ${prefix}`);
      }
      deleted += objects.length;
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);

  return deleted;
}

export const handler = async (event) => {
  validateEnvironment();
  const bucket = event?.detail?.bucket?.name;
  const key = normaliseKey(event?.detail?.object?.key);

  if (bucket !== process.env.SOURCE_BUCKET || !key.startsWith("incoming/") || extname(key).toLowerCase() !== ".mp4") {
    console.log(JSON.stringify({ action: "ignored", bucket, key }));
    return { ignored: true };
  }

  if (await sourceExists(bucket, key)) {
    console.log(JSON.stringify({ action: "stale_delete_ignored", bucket, key }));
    return { stale: true };
  }

  const { videoId } = videoIdentity(key);
  const [hlsObjects, thumbnailObjects] = await Promise.all([
    deletePrefix(process.env.OUTPUT_BUCKET, `hls/${videoId}/`),
    deletePrefix(process.env.OUTPUT_BUCKET, `thumbnails/${videoId}/`)
  ]);

  await documentClient.send(new DeleteCommand({
    TableName: process.env.VIDEOS_TABLE,
    Key: { videoId }
  }));

  console.log(JSON.stringify({
    action: "deleted",
    videoId,
    key,
    outputObjectsDeleted: hlsObjects + thumbnailObjects
  }));
  return { videoId, deleted: true, outputObjectsDeleted: hlsObjects + thumbnailObjects };
};
