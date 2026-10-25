import { interpolate, useCurrentFrame } from "remotion";
import { theme } from "../theme";
import { Reveal } from "./Reveal";
import { Stage } from "./Stage";

export const CloseCard: React.FC<{
  partPrice: number;
  visitPrice: number;
  phone: string;
  tagline: string;
}> = ({ partPrice, visitPrice, phone, tagline }) => {
  const frame = useCurrentFrame();
  const shown = interpolate(frame, [10, 50], [visitPrice, partPrice], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <Stage center>
      <Reveal>
        <div style={{ fontSize: 200, fontWeight: 800, color: theme.warm }}>
          ${shown.toFixed(2)}
        </div>
        <div style={{ fontSize: 50, color: theme.body, marginBottom: 80 }}>
          for the part, versus a ${visitPrice} tech visit
        </div>
      </Reveal>
      <Reveal delay={60}>
        <div style={{ fontSize: 96, fontWeight: 800 }}>{phone}</div>
        <div style={{ fontSize: 44, color: theme.muted, marginTop: 24 }}>
          {tagline}
        </div>
      </Reveal>
    </Stage>
  );
};
