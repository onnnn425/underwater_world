import assert from "node:assert/strict";
import test from "node:test";
import { buildJobSettings } from "../functions/processor/job-settings.mjs";
import { normaliseKey, safeText, titleFromStem, videoIdentity } from "../functions/processor/helpers.mjs";
import { formatDuration, longestOutputDuration } from "../functions/finalizer/helpers.mjs";
import { normaliseKey as normaliseDeletedKey, videoIdentity as cleanupVideoIdentity } from "../functions/cleanup/helpers.mjs";

test("normalises an encoded S3 event key", () => {
  assert.equal(normaliseKey("incoming%2Fgreen+turtle.mp4"), "incoming/green turtle.mp4");
});

test("creates a stable safe video identity", () => {
  const first = videoIdentity("incoming/Green Turtle.mp4");
  const second = videoIdentity("incoming/Green Turtle.mp4");
  assert.equal(first.videoId, second.videoId);
  assert.match(first.videoId, /^green-turtle-[a-f0-9]{8}$/);
  assert.equal(first.sourceStem, "Green Turtle");
});

test("cleanup derives the same identity from a deleted object event", () => {
  const key = normaliseDeletedKey("incoming%2Fgreen+turtle.mp4");
  assert.equal(key, "incoming/green turtle.mp4");
  assert.deepEqual(cleanupVideoIdentity(key), videoIdentity(key));
});

test("derives readable titles and removes markup", () => {
  assert.equal(titleFromStem("green_turtle"), "Green Turtle");
  assert.equal(safeText("<b>Reef</b>", "Fallback", 20), "bReef/b");
});

test("formats durations and selects the longest output", () => {
  const detail = {
    outputGroupDetails: [
      { outputDetails: [{ durationInMs: 21000 }, { durationInMs: 20800 }] },
      { outputDetails: [{ durationInMs: 5000 }] }
    ]
  };
  assert.equal(longestOutputDuration(detail), 21000);
  assert.equal(formatDuration(21000), "00:21");
  assert.equal(formatDuration(3723000), "01:02:03");
});

test("builds HLS and thumbnail output groups", () => {
  const settings = buildJobSettings({
    sourceUri: "s3://source/incoming/test.mp4",
    hlsDestination: "s3://output/hls/test/",
    thumbnailDestination: "s3://output/thumbnails/test/"
  });
  assert.equal(settings.OutputGroups.length, 2);
  assert.equal(settings.OutputGroups[0].Outputs.length, 2);
  assert.equal(settings.OutputGroups[1].Outputs[0].VideoDescription.CodecSettings.Codec, "FRAME_CAPTURE");
});
