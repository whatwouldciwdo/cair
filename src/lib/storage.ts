import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const storageRoot = path.resolve(/* turbopackIgnore: true */ process.env.STORAGE_DIR ?? path.join(process.cwd(), "storage"));

export function resolveStoragePath(relativePath: string) {
  const resolved = path.resolve(storageRoot, relativePath);
  if (resolved !== storageRoot && !resolved.startsWith(`${storageRoot}${path.sep}`)) throw new Error("Storage path tidak valid");
  return resolved;
}

async function writeStoredFile(namespace: "artifacts" | "documents", data: Buffer, extension: string) {
  const normalizedExtension = extension.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!normalizedExtension) throw new Error("Ekstensi artifact tidak valid");
  const date = new Date();
  const directory = `${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  const relativePath = path.posix.join(namespace, directory, `${randomUUID()}.${normalizedExtension}`);
  const destination = resolveStoragePath(relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${randomUUID()}.tmp`;
  await writeFile(temporary, data, { flag: "wx" });
  await rename(temporary, destination);
  return { storagePath: relativePath, size: data.byteLength, checksum: createHash("sha256").update(data).digest("hex") };
}

export function writeArtifactFile(data: Buffer, extension: string) {
  return writeStoredFile("artifacts", data, extension);
}

export function writeDocumentSource(data: Buffer, extension: string) {
  return writeStoredFile("documents", data, extension);
}

export function readArtifactFile(relativePath: string) {
  return readFile(/* turbopackIgnore: true */ resolveStoragePath(relativePath));
}

export const readDocumentSource = readArtifactFile;

export async function deleteArtifactFile(relativePath: string | null) {
  if (!relativePath) return;
  await unlink(resolveStoragePath(relativePath)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}


export const deleteDocumentSource = deleteArtifactFile;