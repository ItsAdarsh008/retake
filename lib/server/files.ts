import fs from "node:fs/promises";

/**
 * Move `tmp` over `dest` (an atomic replace). On Windows the rename fails with EPERM
 * or EBUSY while another request or a virus scanner has `dest` open, so retry briefly.
 */
export async function replaceFile(tmp: string, dest: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fs.rename(tmp, dest);
    } catch (e: any) {
      if (attempt >= 10 || !["EPERM", "EBUSY", "EACCES"].includes(e?.code)) throw e;
      await new Promise((r) => setTimeout(r, 30 * (attempt + 1)));
    }
  }
}
