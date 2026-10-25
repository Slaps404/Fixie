import { AbsoluteFill } from "remotion";
import { theme } from "../theme";

export const Stage: React.FC<{
  children: React.ReactNode;
  center?: boolean;
}> = ({ children, center }) => (
  <AbsoluteFill
    style={{
      backgroundColor: theme.bg,
      color: theme.text,
      fontFamily: theme.font,
      padding: "120px 160px",
      justifyContent: "center",
      alignItems: center ? "center" : "flex-start",
      textAlign: center ? "center" : "left",
    }}
  >
    {children}
  </AbsoluteFill>
);

export const Kicker: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <div
    style={{
      color: theme.accent,
      fontSize: 34,
      fontWeight: 600,
      letterSpacing: 4,
      textTransform: "uppercase",
      marginBottom: 28,
    }}
  >
    {children}
  </div>
);
