export type Word = {
  i: number;
  text: string;
  start: number;
  end: number;
};

export type Paragraph = { from: number; to: number };

export type Edit =
  | { kind: "delete"; from: number; to: number }
  | { kind: "replace"; from: number; to: number; text: string };

export type Scope = "sentence" | "words";
export type LipSyncMode = "lite" | "standard" | "pro";

export type Project = {
  id: string;
  name: string;
  createdAt: string;
  status: "processing" | "ready" | "error";
  stage?: string;
  error?: string;
  sourceFile: string;
  playbackFile: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  words: Word[];
  paragraphs: Paragraph[];
  peaks: number[];
  edits: Edit[];
  demoTranscript?: boolean;
  lastRenderId?: string;
};

export type ProjectSummary = Pick<
  Project,
  "id" | "name" | "createdAt" | "status" | "duration" | "stage"
> & { edits: number };

export type StepStatus = "waiting" | "active" | "done" | "error";

export type RenderStep = {
  key: string;
  label: string;
  status: StepStatus;
  detail?: string;
};

export type RenderJob = {
  id: string;
  projectId: string;
  status: "running" | "done" | "error";
  createdAt: string;
  finishedAt?: string;
  mode: LipSyncMode;
  scope: Scope;
  steps: RenderStep[];
  error?: string;
  output?: string;
  outputDuration?: number;
  creditsEstimate: number;
  creditsCharged: number;
  demo: boolean;
};

export type Status = {
  openai: boolean;
  magicHour: boolean;
  anthropic: boolean;
};

export type Suggestion = {
  from: number;
  to: number;
  reason: string;
};
