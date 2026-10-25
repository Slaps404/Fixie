import { Composition } from "remotion";
import { calculateMetadata, FixieVideo, FPS } from "./FixieVideo";
import { STAGE, SUBMISSION, totalFrames } from "./montage/beats";
import { Montage } from "./montage/Montage";

export const RemotionRoot: React.FC = () => (
  <>
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
    <Composition
      id="Submission"
      component={Montage}
      durationInFrames={totalFrames(SUBMISSION)}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{ beats: SUBMISSION }}
    />
    <Composition
      id="Stage"
      component={Montage}
      durationInFrames={totalFrames(STAGE)}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{ beats: STAGE }}
    />
  </>
);
