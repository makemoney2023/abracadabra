import { connect } from "node:net";
import type { ClamdResult } from "@/lib/scan";

const CHUNK = 64 * 1024;

function endpoint(): { host: string; port: number } {
  return {
    host: process.env.CLAMD_HOST || "127.0.0.1",
    port: Number(process.env.CLAMD_PORT || 3310),
  };
}

/** Limit alerts stay held even when clamd appends FOUND. */
export function parseClamdReply(text: string): ClamdResult {
  const line = text.replaceAll("\0", "").trim();
  if (/:\s*OK\s*$/i.test(line)) return { kind: "ok" };
  if (/exceed|size limit|maxscansize|maxfilesize|maxfiles|maxrecursion|heuristics\.limits/i.test(line)) {
    return { kind: "limit", detail: line };
  }
  const found = line.match(/:\s*(.+)\s+FOUND\s*$/i);
  if (found) return { kind: "found", signature: found[1].trim() };
  return { kind: "error", detail: line || "The scanner did not return a result." };
}

function command(host: string, port: number, write: (socket: import("node:net").Socket) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port });
    let data = "";
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("scanner timed out"));
    }, 15_000);
    socket.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.on("data", (chunk) => {
      data += chunk.toString("utf8");
      if (data.includes("\n") || data.includes("\0")) {
        clearTimeout(timer);
        socket.end();
        resolve(data);
      }
    });
    socket.on("connect", () => write(socket));
  });
}

/** True when clamd answers PING. */
export async function pingClamd(): Promise<boolean> {
  const { host, port } = endpoint();
  try {
    const reply = await command(host, port, (socket) => {
      socket.write("nPING\n");
    });
    return reply.includes("PONG");
  } catch {
    return false;
  }
}

/** One INSTREAM of the bytes already read from storage. */
export async function scanInstream(bytes: Uint8Array): Promise<ClamdResult> {
  const { host, port } = endpoint();
  try {
    const reply = await command(host, port, (socket) => {
      socket.write("nINSTREAM\n");
      for (let offset = 0; offset < bytes.byteLength; offset += CHUNK) {
        const chunk = bytes.subarray(offset, offset + CHUNK);
        const header = Buffer.alloc(4);
        header.writeUInt32BE(chunk.byteLength, 0);
        socket.write(header);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
    return parseClamdReply(reply);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "The scanner did not return a result.";
    return { kind: "error", detail };
  }
}
