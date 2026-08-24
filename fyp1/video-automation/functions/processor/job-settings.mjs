export function buildJobSettings({ sourceUri, hlsDestination, thumbnailDestination }) {
  return {
    Inputs: [
      {
        AudioSelectors: {
          "Audio Selector 1": { DefaultSelection: "DEFAULT" }
        },
        VideoSelector: {},
        TimecodeSource: "ZEROBASED",
        FileInput: sourceUri
      }
    ],
    OutputGroups: [
      {
        Name: "Apple HLS",
        OutputGroupSettings: {
          Type: "HLS_GROUP_SETTINGS",
          HlsGroupSettings: {
            SegmentLength: 6,
            MinSegmentLength: 0,
            Destination: hlsDestination
          }
        },
        Outputs: [
          {
            NameModifier: "_720p",
            VideoDescription: {
              Width: 1280,
              Height: 720,
              CodecSettings: {
                Codec: "H_264",
                H264Settings: {
                  RateControlMode: "QVBR",
                  QvbrSettings: { QvbrQualityLevel: 7 },
                  MaxBitrate: 3500000,
                  SceneChangeDetect: "TRANSITION_DETECTION",
                  GopSize: 2,
                  GopSizeUnits: "SECONDS"
                }
              }
            },
            AudioDescriptions: [
              {
                AudioSourceName: "Audio Selector 1",
                CodecSettings: {
                  Codec: "AAC",
                  AacSettings: {
                    Bitrate: 96000,
                    CodingMode: "CODING_MODE_2_0",
                    SampleRate: 48000
                  }
                }
              }
            ],
            ContainerSettings: { Container: "M3U8", M3u8Settings: {} }
          },
          {
            NameModifier: "_480p",
            VideoDescription: {
              Width: 854,
              Height: 480,
              CodecSettings: {
                Codec: "H_264",
                H264Settings: {
                  RateControlMode: "QVBR",
                  QvbrSettings: { QvbrQualityLevel: 7 },
                  MaxBitrate: 1200000,
                  SceneChangeDetect: "TRANSITION_DETECTION",
                  GopSize: 2,
                  GopSizeUnits: "SECONDS"
                }
              }
            },
            AudioDescriptions: [
              {
                AudioSourceName: "Audio Selector 1",
                CodecSettings: {
                  Codec: "AAC",
                  AacSettings: {
                    Bitrate: 96000,
                    CodingMode: "CODING_MODE_2_0",
                    SampleRate: 48000
                  }
                }
              }
            ],
            ContainerSettings: { Container: "M3U8", M3u8Settings: {} }
          }
        ]
      },
      {
        Name: "Frame capture",
        OutputGroupSettings: {
          Type: "FILE_GROUP_SETTINGS",
          FileGroupSettings: { Destination: thumbnailDestination }
        },
        Outputs: [
          {
            NameModifier: "_thumb",
            VideoDescription: {
              Width: 1280,
              Height: 720,
              CodecSettings: {
                Codec: "FRAME_CAPTURE",
                FrameCaptureSettings: {
                  FramerateNumerator: 1,
                  FramerateDenominator: 5,
                  MaxCaptures: 4,
                  Quality: 90
                }
              }
            },
            ContainerSettings: { Container: "RAW" }
          }
        ]
      }
    ]
  };
}
