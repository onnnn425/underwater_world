# Automated video publishing

This stack turns an MP4 uploaded to `s3://underwater-demo/incoming/` into two adaptive HLS renditions and thumbnail frames. A video becomes visible through the catalogue API only after MediaConvert reports `COMPLETE`. Deleting that source MP4 removes its catalogue record and generated outputs.

## Deployed instance

- Stack: `underwater-video-automation`
- Region: `ap-southeast-5`
- Catalogue API: `https://k3uzlczx6j.execute-api.ap-southeast-5.amazonaws.com/videos`
- Upload location: `s3://underwater-demo/incoming/`
- Catalogue table: `underwater-video-automation-VideosTable-17FE21BM26FFA`

The stack reached `UPDATE_COMPLETE` on 2026-08-25. The automated test copied the authorised `clown_fish.mp4` source to `incoming/automation_test.mp4`, submitted MediaConvert job `1787593318160-3drhaf`, created 720p and 480p HLS outputs plus thumbnails, published a 21-second catalogue record, returned four videos from the API, and played successfully in the browser with no console warnings.

## Runtime flow

1. S3 sends an `Object Created` event to EventBridge.
2. The processor Lambda accepts only `.mp4` objects under `incoming/`, derives a safe catalogue identity and creates a `PROCESSING` DynamoDB record.
3. The processor submits one MediaConvert job with 720p and 480p HLS outputs plus frame capture.
4. MediaConvert sends its terminal event to EventBridge.
5. The finalizer publishes the CloudFront playlist and thumbnail URLs, or marks the record `FAILED`.
6. `GET /videos` returns only `PUBLISHED` items. The prototype falls back to its three built-in records when the API is unavailable.
7. An S3 `Object Deleted` event invokes the cleanup Lambda, which removes that video's generated HLS files, thumbnails, and DynamoDB record.

Regional resources must be deployed in `ap-southeast-5`. CloudFront remains the existing global delivery service. Both S3 buckets remain private.

## Upload convention

Upload MP4 files to `incoming/`. The filename becomes the title, so `green_turtle.mp4` appears as `Green Turtle`. The default category is `Uncategorised`.

Optional S3 object metadata can override catalogue fields:

- `title`
- `category`
- `description`
- `tags` as a comma-separated list

Uploading the same S3 key with identical content is ignored. Replacing it with different content starts a new job and the job-id guard prevents an older completion event from overwriting the new state.

Deleting an MP4 from `incoming/` removes the corresponding video from the API and page. The cleanup is limited to the derived `hls/<video-id>/` and `thumbnails/<video-id>/` prefixes. If the same source key already exists again when a delayed delete event arrives, the event is treated as stale and ignored.

## Deployment sequence

1. Run the Node tests:

   `node --test tests/helpers.test.mjs`

2. Run `build-and-stage.ps1`. It creates ZIP files and uploads versioned Lambda artifacts under the private source bucket's `automation/code/` prefix.
3. Validate `template.yaml`, then create and inspect a CloudFormation change set named for the release. Do not execute a change set with a `FAIL` validation result.
4. Execute the approved change set and wait for `CREATE_COMPLETE`.
5. Seed the three existing catalogue records from `seed/*.json` with `aws dynamodb put-item`.
6. Enable S3-to-EventBridge delivery while preserving any existing notification configuration:

   `aws s3api put-bucket-notification-configuration --bucket underwater-demo --notification-configuration '{"EventBridgeConfiguration":{}}' --profile underwater-fyp1`

7. Set `window.APP_CONFIG.catalogApiUrl` in `prototype/config.js` to the `CatalogApiUrl` stack output.

## Verification

Upload a short authorised MP4 to `incoming/automation_test.mp4`, then verify:

- processor Lambda has no errors;
- MediaConvert reaches `COMPLETE`;
- DynamoDB status changes from `PROCESSING` to `PUBLISHED`;
- the API returns the new item;
- the CloudFront `.m3u8` URL and thumbnail return successfully;
- the video appears and plays in the prototype.

Then delete the test source and verify:

- the cleanup Lambda logs one `deleted` action;
- the catalogue API no longer returns the video;
- its generated HLS and thumbnail prefixes are empty.

The test upload triggers MediaConvert and therefore incurs processing and output-storage charges. Cleanup adds S3 list/delete, Lambda, EventBridge, DynamoDB delete, and logging requests; at FYP scale these are small usage-based charges. CloudFront delivery incurs request and data-transfer charges when viewed.

## Operational notes

- CloudWatch log retention is 14 days.
- Processor, finalizer and dead-letter queue alarms are created without notification actions; connect them to an approved notification destination if needed.
- CloudTrail data events and S3 access logging are recommended for production observability but are not enabled here because they create additional ongoing log storage and request costs.
- The catalogue endpoint is intentionally public and read-only. Uploads remain restricted to team members with private S3 write access.
- The DynamoDB table and log groups are retained if the stack is deleted. Decide whether to keep or separately remove retained data during cleanup.
