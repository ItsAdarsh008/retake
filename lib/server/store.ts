import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { env } from "./env";
import type { Project, ProjectSummary, RenderJob } from "../types";

export const newId = () => crypto.randomBytes(6).toString("base64url").replace(/[-_]/g, "x");

const SAFE_ID = /^[A-Za-z0-9]{4,32}$/;
export function assertId(id: string) {
  if (!SAFE_ID.test(id)) throw new Error("Bad id");
  return id;
}

export const projectDir = (id: string) => path.join(env.dataDir, "projects", assertId(id));

async function writeJson(file: string, data: unknown) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data));
  await fs.rename(tmp, file);
}

export async function readProject(id: string): Promise<Project | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(projectDir(id), "project.json"), "utf8"));
  } catch {
    return null;
  }
}

// Serialise writes per project so background processing and autosave can't clobber each other.
const locks = new Map<string, Promise<unknown>>();
export async function updateProject(id: string, fn: (p: Project) => Project | void): Promise<Project> {
  const prev = locks.get(id) ?? Promise.resolve();
  const next = prev.then(async () => {
    const p = await readProject(id);
    if (!p) throw new Error("Project not found");
    const res = fn(p) ?? p;
    await writeJson(path.join(projectDir(id), "project.json"), res);
    return res;
  });
  locks.set(id, next.catch(() => {}));
  return next;
}

export async function createProject(p: Project) {
  await fs.mkdir(projectDir(p.id), { recursive: true });
  await writeJson(path.join(projectDir(p.id), "project.json"), p);
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const dir = path.join(env.dataDir, "projects");
  let ids: string[] = [];
  try {
    ids = await fs.readdir(dir);
  } catch {
    return [];
  }
  const out: ProjectSummary[] = [];
  for (const id of ids) {
    if (!SAFE_ID.test(id)) continue;
    const p = await readProject(id);
    if (p)
      out.push({
        id: p.id,
        name: p.name,
        createdAt: p.createdAt,
        status: p.status,
        duration: p.duration,
        stage: p.stage,
        edits: p.edits?.length ?? 0,
      });
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteProject(id: string) {
  await fs.rm(projectDir(id), { recursive: true, force: true });
}

const jobFile = (projectId: string, jobId: string) =>
  path.join(projectDir(projectId), "renders", `${assertId(jobId)}.json`);

export async function saveJob(job: RenderJob) {
  await fs.mkdir(path.join(projectDir(job.projectId), "renders"), { recursive: true });
  await writeJson(jobFile(job.projectId, job.id), job);
}

export async function readJob(projectId: string, jobId: string): Promise<RenderJob | null> {
  try {
    return JSON.parse(await fs.readFile(jobFile(projectId, jobId), "utf8"));
  } catch {
    return null;
  }
}
