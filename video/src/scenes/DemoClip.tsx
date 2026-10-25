import { Video } from "@remotion/media";
import { AbsoluteFill, staticFile } from "remotion";
import { theme } from "../theme";
import { Stage } from "./Stage";

export const DemoClip: React.FC<{ file: string; found: boolean }> = ({
  file,
  found,
}) =>
  found ? (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <Video name="Demo recording" src={staticFile(file)} objectFit="contain" />
    </AbsoluteFill>
  ) : (
    <Stage center>
      <div style={{ fontSize: 72, fontWeight: 800 }}>
        Demo recording goes here
      </div>
      <div style={{ fontSize: 44, color: theme.body, marginTop: 24 }}>
        Put the cut at video/public/{file}
      </div>
    </Stage>
  );
