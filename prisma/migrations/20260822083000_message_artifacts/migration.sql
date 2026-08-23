CREATE TYPE "ArtifactFormat" AS ENUM ('PDF', 'DOCX', 'XLSX');

ALTER TABLE "Message"
ADD COLUMN "artifactFormat" "ArtifactFormat",
ADD COLUMN "artifactName" TEXT;