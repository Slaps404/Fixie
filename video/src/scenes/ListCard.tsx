import { theme } from "../theme";
import { Reveal } from "./Reveal";
import { Kicker, Stage } from "./Stage";

export const ListCard: React.FC<{
  kicker: string;
  heading: string;
  items: { label: string; detail: string }[];
  numbered?: boolean;
  stagger?: number;
}> = ({ kicker, heading, items, numbered, stagger = 14 }) => (
  <Stage>
    <Reveal>
      <Kicker>{kicker}</Kicker>
      <div style={{ fontSize: 84, fontWeight: 800, marginBottom: 56 }}>
        {heading}
      </div>
    </Reveal>
    <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
      {items.map((item, i) => (
        <Reveal key={item.label} delay={18 + i * stagger}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 28 }}>
            <div
              style={{
                width: 64,
                fontSize: 44,
                fontWeight: 800,
                color: numbered ? theme.accent : theme.warm,
              }}
            >
              {numbered ? i + 1 : "✓"}
            </div>
            <div style={{ fontSize: 50, fontWeight: 600 }}>{item.label}</div>
            <div style={{ fontSize: 44, color: theme.body }}>{item.detail}</div>
          </div>
        </Reveal>
      ))}
    </div>
  </Stage>
);
