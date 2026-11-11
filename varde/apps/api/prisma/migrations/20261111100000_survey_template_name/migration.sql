-- A survey can be renamed in Varde without a new version (11.11, asked for by Oleksandr): the name
-- the library, the round pickers and «Samtalar» show. A published version stays as it was, so what
-- respondents and clients read keeps the title that was published and accepted in Nynorsk.

-- AlterTable
ALTER TABLE "survey_template" ADD COLUMN     "name" TEXT;
