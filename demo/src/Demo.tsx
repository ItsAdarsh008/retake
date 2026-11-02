import React from "react";
import { Series } from "remotion";
import { AppScene, Compare, Edit, EndCard, Retake, Take, Title } from "./scenes";
import { WideApp, WideCompare, WideRetake, WideTake } from "./scenes-wide";
import { DUR, edit, steps } from "./timeline";

export type DemoProps = { cta?: string; layout?: "reel" | "wide" };

// Hard cuts throughout: on a feed a cross-fade is dead time. The same beats and
// timings in both layouts; only how each beat is drawn differs.
export const Demo: React.FC<DemoProps> = ({ cta, layout = "reel" }) => {
  const wide = layout === "wide";
  return (
    <Series>
      <Series.Sequence name="Take" durationInFrames={DUR.take}>
        {wide ? <WideTake /> : <Take />}
      </Series.Sequence>
      <Series.Sequence name="Edit" durationInFrames={DUR.edit}>
        {wide ? <WideApp beat={edit} /> : <Edit />}
      </Series.Sequence>
      <Series.Sequence name="Retake" durationInFrames={DUR.retake}>
        {wide ? <WideRetake /> : <Retake />}
      </Series.Sequence>
      <Series.Sequence name="Title" durationInFrames={DUR.title}>
        <Title />
      </Series.Sequence>
      {steps.map((s, k) => (
        <Series.Sequence key={k} name={`Step ${s.step}: ${s.label}`} durationInFrames={DUR.steps[k]}>
          {wide ? <WideApp beat={s} /> : <AppScene beat={s} />}
        </Series.Sequence>
      ))}
      <Series.Sequence name="Before and after" durationInFrames={DUR.compare}>
        {wide ? <WideCompare /> : <Compare />}
      </Series.Sequence>
      <Series.Sequence name="End card" durationInFrames={DUR.end}>
        <EndCard cta={cta} />
      </Series.Sequence>
    </Series>
  );
};
