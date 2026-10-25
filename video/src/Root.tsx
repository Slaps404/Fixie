import { Composition } from "remotion";
import { calculateMetadata, FixieVideo, FPS } from "./FixieVideo";

export const RemotionRoot: React.FC = () => (
  <Composition
    id="FixieVideo"
    component={FixieVideo}
    durationInFrames={FPS * 30}
    fps={FPS}
    width={1920}
    height={1080}
    defaultProps={{ demoFile: "demo.mp4", demoSeconds: null }}
    calculateMetadata={calculateMetadata}
  />
);
