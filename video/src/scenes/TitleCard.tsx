import { theme } from "../theme";
import { Reveal } from "./Reveal";
import { Stage } from "./Stage";

export const TitleCard: React.FC<{ title: string; subtitle: string }> = ({
  title,
  subtitle,
}) => (
  <Stage center>
    <Reveal>
      <div style={{ fontSize: 180, fontWeight: 800, letterSpacing: -4 }}>
        {title}
      </div>
    </Reveal>
    <Reveal delay={12}>
      <div style={{ fontSize: 56, color: theme.body, maxWidth: 1300 }}>
        {subtitle}
      </div>
    </Reveal>
  </Stage>
);
