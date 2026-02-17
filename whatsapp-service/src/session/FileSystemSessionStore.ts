import fs from "node:fs/promises";
import path from "node:path";

export class FileSystemSessionStore {
  constructor(private readonly rootDir: string) {}

  getSessionPath(connectionId: string) {
    return path.join(this.rootDir, connectionId);
  }

  async ensureRoot() {
    await fs.mkdir(this.rootDir, { recursive: true });
  }

  async ensureSessionPath(connectionId: string) {
    const sessionPath = this.getSessionPath(connectionId);
    await fs.mkdir(sessionPath, { recursive: true });
    return sessionPath;
  }

  async sessionExists(connectionId: string) {
    try {
      await fs.access(this.getSessionPath(connectionId));
      return true;
    } catch {
      return false;
    }
  }

  async clearSession(connectionId: string) {
    await fs.rm(this.getSessionPath(connectionId), {
      recursive: true,
      force: true,
    });
  }
}
