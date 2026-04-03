export interface HeadingSectionRange {
  start: number;
  end: number;
}

export function findHeadingSectionRange(
  lines: string[],
  heading: string,
  headingLevel: number,
): HeadingSectionRange | null {
  const normalizedLevel = Math.min(Math.max(Math.floor(headingLevel), 1), 6);
  const headingLine = `${"#".repeat(normalizedLevel)} ${heading}`;
  const headingIndex = lines.findIndex((line) => line.trim() === headingLine);

  if (headingIndex === -1) {
    return null;
  }

  let sectionEnd = lines.length;
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const headingMatch = lines[index].match(/^(#{1,6})\s+/);
    if (!headingMatch) {
      continue;
    }

    const currentHeadingLevel = headingMatch[1].length;
    if (currentHeadingLevel <= normalizedLevel) {
      sectionEnd = index;
      break;
    }
  }

  return {
    start: headingIndex,
    end: sectionEnd,
  };
}

export function upsertHeadingSection(
  content: string,
  heading: string,
  headingLevel: number,
  sectionBody: string,
): string {
  const trimmedContent = content.replace(/\s+$/, "");
  const lines = trimmedContent.length > 0 ? trimmedContent.split(/\r?\n/) : [];
  const sectionRange = findHeadingSectionRange(lines, heading, headingLevel);

  if (!sectionRange) {
    const normalizedLevel = Math.min(Math.max(Math.floor(headingLevel), 1), 6);
    const headingLine = `${"#".repeat(normalizedLevel)} ${heading}`;
    const prefix = trimmedContent.length > 0 ? `${trimmedContent}\n\n` : "";
    return `${prefix}${headingLine}\n${sectionBody}\n`;
  }

  const updatedLines = [
    ...lines.slice(0, sectionRange.start + 1),
    sectionBody,
    ...lines.slice(sectionRange.end),
  ];

  return `${updatedLines.join("\n")}\n`;
}
