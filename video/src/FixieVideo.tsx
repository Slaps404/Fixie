import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { CalculateMetadataFunction, staticFile } from "remotion";
import { Input, ALL_FORMATS, UrlSource } from "mediabunny";
import { CloseCard } from "./scenes/CloseCard";
import { DemoClip } from "./scenes/DemoClip";
import { ListCard } from "./scenes/ListCard";
import { TitleCard } from "./scenes/TitleCard";

export const FPS = 30;
const FADE = 15;
const PLACEHOLDER_SECONDS = 4;
const MONTAGE_SECONDS = { title: 4, how: 9, guards: 8, close: 7 };

export type FixieVideoProps = {
  demoFile: string;
  demoSeconds: number | null;
};

const demoFrames = (s: number | null) =>
  Math.round((s ?? PLACEHOLDER_SECONDS) * FPS);

export const calculateMetadata: CalculateMetadataFunction<
  FixieVideoProps
> = async ({ props }) => {
  let demoSeconds: number | null = null;
  try {
    const input = new Input({
      formats: ALL_FORMATS,
      source: new UrlSource(staticFile(props.demoFile)),
    });
    demoSeconds = await input.computeDuration();
  } catch {
    // No recording dropped in yet: render the placeholder card.
  }
  const scenes = [
    demoSeconds ?? PLACEHOLDER_SECONDS,
    ...Object.values(MONTAGE_SECONDS),
  ];
  const total = scenes.reduce((sum, s) => sum + Math.round(s * FPS), 0);
  return {
    durationInFrames: total - FADE * (scenes.length - 1),
    props: { ...props, demoSeconds },
  };
};

const fadeIn = (
  <TransitionSeries.Transition
    presentation={fade()}
    timing={linearTiming({ durationInFrames: FADE })}
  />
);

export const FixieVideo: React.FC<FixieVideoProps> = ({
  demoFile,
  demoSeconds,
}) => (
  <TransitionSeries name="Fixie video">
    <TransitionSeries.Sequence
      name="Demo"
      durationInFrames={demoFrames(demoSeconds)}
    >
      <DemoClip file={demoFile} found={demoSeconds !== null} />
    </TransitionSeries.Sequence>
    {fadeIn}
    <TransitionSeries.Sequence
      name="Title"
      durationInFrames={MONTAGE_SECONDS.title * FPS}
    >
      <TitleCard
        title="Fixie"
        subtitle="One phone number for anything physical that breaks."
      />
    </TransitionSeries.Sequence>
    {fadeIn}
    <TransitionSeries.Sequence
      name="How it works"
      durationInFrames={MONTAGE_SECONDS.how * FPS}
    >
      <ListCard
        kicker="How it works"
        heading="One call. Fixie does the rest."
        numbered
        items={[
          { label: "Call from any phone", detail: "no app, no screen" },
          { label: "Diagnosis by voice", detail: "finds the exact part" },
          {
            label: "Calls suppliers in parallel",
            detail: "quotes captured live",
          },
          {
            label: "Calls you back",
            detail: 'nothing ships until you say "order it"',
          },
          { label: "Coaches the install", detail: "until it's fixed" },
        ]}
      />
    </TransitionSeries.Sequence>
    {fadeIn}
    <TransitionSeries.Sequence
      name="Guardrails"
      durationInFrames={MONTAGE_SECONDS.guards * FPS}
    >
      <ListCard
        kicker="Guardrails"
        heading="Enforced in code, not prompts."
        items={[
          { label: "Budget cap", detail: "over-budget quotes are rejected" },
          { label: "Safety gate", detail: "no power until it's unplugged" },
          { label: "Vendor allow-list", detail: "only approved numbers" },
          { label: "Spend meter", detail: "Fixie's own call cost is capped" },
          { label: "Kill switch", detail: "ends every live call" },
        ]}
      />
    </TransitionSeries.Sequence>
    {fadeIn}
    <TransitionSeries.Sequence
      name="Close"
      durationInFrames={MONTAGE_SECONDS.close * FPS}
    >
      <CloseCard
        partPrice={13.05}
        visitPrice={200}
        phone="+1 619-771-1086"
        tagline="Call it. Fixie closes the loop."
      />
    </TransitionSeries.Sequence>
  </TransitionSeries>
);
