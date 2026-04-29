import * as cheerio from 'cheerio';
import * as unzipper from 'unzipper';

function normalizeText(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function paragraphText($: cheerio.Root, paragraph: any): string {
  const parts: string[] = [];
  $(paragraph).children('hp\\:run').children('hp\\:t').each((_: number, textNode: any) => {
    const text = $(textNode).text();
    if (text) parts.push(text);
  });
  return parts.join('').trim();
}

export async function extractHwpxText(buffer: Buffer, options: { skipFirstTableRow?: boolean } = {}): Promise<string> {
  const dir = await unzipper.Open.buffer(buffer);
  const sectionEntries = dir.files
    .filter((entry) => /^Contents\/section\d+\.xml$/i.test(entry.path))
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));

  const chunks: string[] = [];
  let skippedFirstTableRow = false;

  for (const entry of sectionEntries) {
    const xmlContent = (await entry.buffer()).toString('utf8');
    const $ = cheerio.load(xmlContent, { xmlMode: true });
    const skipParagraphs = new Set<any>();

    if (options.skipFirstTableRow && !skippedFirstTableRow) {
      const firstRow = $('hp\\:tbl').first().find('hp\\:tr').first();
      if (firstRow.length) {
        firstRow.find('hp\\:p').each((_: number, paragraph: any) => skipParagraphs.add(paragraph));
        skippedFirstTableRow = true;
      }
    }

    $('hp\\:p').each((_: number, paragraph: any) => {
      if (skipParagraphs.has(paragraph)) return;
      if ($(paragraph).find('hp\\:tbl').length) return;

      const line = paragraphText($, paragraph);
      if (line) chunks.push(line);
    });
  }

  return normalizeText(chunks.join('\n'));
}
