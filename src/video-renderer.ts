import { download } from "r628";
import { MainCanvas } from "./draw-components";
import { specifyComponent } from "./ecs";

export const VideoRenderer = specifyComponent({
  create() {},
  onDestroy() {},
  async init(waitFor) {
    const {
      BufferTarget,
      CanvasSource,
      getFirstEncodableVideoCodec,
      Mp4OutputFormat,
      Output,
      QUALITY_HIGH,
      WebMOutputFormat,
    } = await import("mediabunny");
    const mainCanvas = await waitFor(MainCanvas);
    const output = new Output({
      target: new BufferTarget(),
      format: new WebMOutputFormat(),
    });

    const videoCodec = await getFirstEncodableVideoCodec(
      output.format.getSupportedVideoCodecs(),
      {
        width: mainCanvas.canvas.width,
        height: mainCanvas.canvas.height,
      }
    );

    const source = new CanvasSource(mainCanvas.canvas, {
      codec: videoCodec,
      bitrate: QUALITY_HIGH,
    });

    output.addVideoTrack(source);

    await output.start();

    return {
      frame: 0,
      output,
      source,
    };
  },
  async renderUpdate({ state }) {
    state.frame++;
    if (state.frame > 300) {
    } else if (state.frame === 300) {
      await state.source.close();
      await state.output.finalize();
      download(new Blob([state.output.target.buffer!]), "test.mp4");
    } else {
      await state.source.add(state.frame / 30, 1 / 30);
    }
  },
  brand: "videoRenderer",
  dependencies: [],
  globalDependencies: [MainCanvas],
});
