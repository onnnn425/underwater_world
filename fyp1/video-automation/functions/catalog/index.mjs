import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({ maxAttempts: 3 }));

export const handler = async () => {
  const videos = [];
  let exclusiveStartKey;

  do {
    const page = await documentClient.send(new ScanCommand({
      TableName: process.env.VIDEOS_TABLE,
      FilterExpression: "#status = :published",
      ExpressionAttributeNames: { "#status": "status", "#duration": "duration" },
      ExpressionAttributeValues: { ":published": "PUBLISHED" },
      ProjectionExpression: "videoId, streamKey, title, category, description, tags, #duration, streamUrl, image, publishedAt",
      ExclusiveStartKey: exclusiveStartKey
    }));
    videos.push(...(page.Items || []));
    exclusiveStartKey = page.LastEvaluatedKey;
  } while (exclusiveStartKey);

  videos.sort((left, right) => String(left.title).localeCompare(String(right.title)));
  return {
    statusCode: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*"
    },
    body: JSON.stringify({ videos })
  };
};
