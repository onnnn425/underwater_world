/*
 * FYP1 deployment configuration.
 * After AWS setup, replace the empty value with the HTTPS CloudFront master
 * playlist URL, for example: https://d123example.cloudfront.net/hls/master.m3u8
 * Do not place AWS credentials or private bucket URLs in this file.
 */
window.APP_CONFIG = {
  catalogApiUrl: "https://k3uzlczx6j.execute-api.ap-southeast-5.amazonaws.com/videos",
  hlsStreams: {
    clownFish: "https://d2du92h297hvfr.cloudfront.net/hls/clown_fish/clown_fish.m3u8",
    purpleFish: "https://d2du92h297hvfr.cloudfront.net/hls/purple_fish/purple_fish.m3u8",
    redFish: "https://d2du92h297hvfr.cloudfront.net/hls/red_fish/red_fish.m3u8"
  }
};
