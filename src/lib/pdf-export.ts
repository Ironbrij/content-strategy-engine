import jsPDF from "jspdf";

export interface PdfStrategyData {
  avatar: string;
  services_profession: string;
  audience: string;
  generated_at: string;
  fears: string[];
  frustrations: string[];
  dreams: string[];
  desires: string[];
  hooks: string[];
  stories: unknown[];
  linkedin_posts: string[];
  facebook_posts: string[];
}

type RGB = [number, number, number];

const PRIMARY: RGB = [0, 103, 255];
const HEADING: RGB = [15, 23, 42];
const BODY: RGB = [54, 65, 81];
const BORDER: RGB = [209, 218, 229];
const TINT: RGB = [231, 246, 255];
const MUTED: RGB = [120, 130, 145];
const WHITE: RGB = [255, 255, 255];

const FEAR_COLOR: RGB = [220, 38, 38];
const FRUSTRATION_COLOR: RGB = [234, 88, 12];
const DREAM_COLOR: RGB = [0, 103, 255];
const DESIRE_COLOR: RGB = [219, 39, 119];
const HOOK_COLOR: RGB = [0, 103, 255];
const STORY_COLOR: RGB = [124, 58, 237];
const LINKEDIN_COLOR: RGB = [10, 102, 194];
const FACEBOOK_COLOR: RGB = [24, 119, 242];

interface NormalizedStory {
  story: string;
  framework: string;
  format: string;
  type: string;
}

function normalizeStories(stories: unknown[]): NormalizedStory[] {
  return (stories || []).map((item) => {
    if (typeof item === "object" && item !== null && typeof (item as any).story === "string") {
      const s = item as any;
      return { story: s.story, framework: s.framework ?? "", format: s.format ?? "", type: s.type ?? "" };
    }
    if (typeof item === "string") {
      try {
        const parsed = JSON.parse(item);
        if (parsed?.story) {
          return { story: parsed.story, framework: parsed.framework ?? "", format: parsed.format ?? "", type: parsed.type ?? "" };
        }
      } catch {
        // not JSON, treat as plain string
      }
      return { story: item, framework: "", format: "", type: "" };
    }
    return { story: String(item), framework: "", format: "", type: "" };
  });
}

// jsPDF's standard fonts only support WinAnsi (roughly Latin-1) characters.
// Emoji and other symbols outside that range corrupt rendering for the rest
// of the line, producing garbled text. Strip them before adding to the PDF,
// and normalize a few common "smart" punctuation marks to safe equivalents.
function sanitizeForPdf(text: string): string {
  if (!text) return "";
  return text
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "")
    .replace(/[\u{2B00}-\u{2BFF}]/gu, "")
    .replace(/[\u{2190}-\u{21FF}]/gu, "")
    .replace(/[\u{FE00}-\u{FE0F}]/gu, "")
    .replace(/\u200D/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2013/g, "-")
    .replace(/\u2014/g, "--")
    .replace(/\u2026/g, "...")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function downloadStrategyPdf(data: PdfStrategyData) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const maxWidth = pageWidth - margin * 2;
  const footerZone = 36;
  let y = margin;
  let isFirstPage = true;

  function newPage() {
    doc.addPage();
    isFirstPage = false;
    y = margin;
    drawRunningHeader();
  }

  function ensureSpace(needed: number) {
    if (y + needed > pageHeight - footerZone) {
      newPage();
    }
  }

  function drawRunningHeader() {
    doc.setFillColor(...PRIMARY);
    doc.rect(0, 0, pageWidth, 4, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text("CLARIFY", margin, 22);
    doc.setFont("helvetica", "normal");
    doc.text("6 Month Content Strategy", pageWidth - margin, 22, { align: "right" });
    y = 40;
  }

  function drawHero() {
    const heroHeight = 92;
    doc.setFillColor(...TINT);
    doc.rect(0, 0, pageWidth, heroHeight, "F");
    doc.setFillColor(...PRIMARY);
    doc.roundedRect(margin, 26, 30, 30, 7, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...WHITE);
    doc.text("C", margin + 15, 46, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(...HEADING);
    doc.text("6 Months Content Strategy", margin + 42, 44);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...BODY);
    const generatedDate = (() => {
      const d = new Date(data.generated_at);
      if (isNaN(d.getTime())) return data.generated_at;
      return d.toLocaleString();
    })();
    doc.text(`Generated ${generatedDate}`, margin + 42, 60);

    y = heroHeight + 24;
  }

  function drawInputsSummary() {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    const labelHeight = 12;
    const rowGap = 10;

    function fieldBlock(x: number, w: number, label: string, rawValue: string): number {
      const value = sanitizeForPdf(rawValue);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...PRIMARY);
      doc.text(label.toUpperCase(), x, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(...BODY);
      const lines = doc.splitTextToSize(value, w);
      doc.text(lines, x, y + labelHeight);
      return lines.length * 13 + labelHeight;
    }

    ensureSpace(70);
    const cardTop = y;
    doc.setDrawColor(...BORDER);
    doc.setFillColor(...WHITE);

    const padding = 16;
    const innerX = margin + padding;
    const innerW = maxWidth - padding * 2;
    y = cardTop + padding;

    const avatarHeight = fieldBlock(innerX, innerW, "Avatar", data.avatar);
    y += avatarHeight + rowGap;

    const colGap = 24;
    const colWidth = (innerW - colGap) / 2;
    const beforeColsY = y;
    const servicesHeight = fieldBlock(innerX, colWidth, "Services / Profession", data.services_profession);
    const audienceHeight = fieldBlock(innerX + colWidth + colGap, colWidth, "Audience", data.audience);
    y = beforeColsY + Math.max(servicesHeight, audienceHeight);

    const cardHeight = y - cardTop + padding;
    doc.roundedRect(margin, cardTop, maxWidth, cardHeight, 8, 8, "S");

    y = cardTop + cardHeight + 26;
  }

  function drawSectionTitle(title: string, count: number, accent: RGB) {
    ensureSpace(30);
    doc.setFillColor(...accent);
    doc.roundedRect(margin, y - 9, 9, 9, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...HEADING);
    doc.text(title, margin + 16, y);
    const titleWidth = doc.getTextWidth(title);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(`(${count})`, margin + 16 + titleWidth + 5, y);
    y += 8;
    doc.setDrawColor(...BORDER);
    doc.line(margin, y, pageWidth - margin, y);
    y += 16;
  }

  function addBulletCard(rawText: string, accent: RGB) {
    const text = sanitizeForPdf(rawText);
    if (!text) return;
    const padX = 14;
    const padY = 10;
    const textX = margin + padX + 16;
    const textWidth = maxWidth - padX * 2 - 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.8);
    const lines = doc.splitTextToSize(text, textWidth);
    const lineHeight = 13.5;
    const cardHeight = lines.length * lineHeight + padY * 2;
    ensureSpace(cardHeight + 8);

    doc.setDrawColor(...BORDER);
    doc.setFillColor(...WHITE);
    doc.roundedRect(margin, y, maxWidth, cardHeight, 6, 6, "S");
    doc.setFillColor(...accent);
    doc.circle(margin + padX + 4, y + padY + 4, 2.6, "F");

    doc.setTextColor(...BODY);
    doc.text(lines, textX, y + padY + 8);
    y += cardHeight + 8;
  }

  function addNumberedCard(rawText: string, index: number, accent: RGB) {
    const text = sanitizeForPdf(rawText);
    if (!text) return;
    const padX = 14;
    const padY = 10;
    const badgeSpace = 26;
    const textX = margin + padX + badgeSpace;
    const textWidth = maxWidth - padX * 2 - badgeSpace;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.8);
    const lines = doc.splitTextToSize(text, textWidth);
    const lineHeight = 13.5;
    const cardHeight = Math.max(lines.length * lineHeight + padY * 2, 34);
    ensureSpace(cardHeight + 8);

    doc.setDrawColor(...BORDER);
    doc.setFillColor(...WHITE);
    doc.roundedRect(margin, y, maxWidth, cardHeight, 6, 6, "S");

    const badgeCx = margin + padX + 8;
    const badgeCy = y + padY + 5;
    doc.setFillColor(...accent);
    doc.circle(badgeCx, badgeCy, 9, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...WHITE);
    doc.text(String(index + 1), badgeCx, badgeCy + 3, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.8);
    doc.setTextColor(...BODY);
    doc.text(lines, textX, y + padY + 8);
    y += cardHeight + 8;
  }

  function addStoryCard(item: NormalizedStory, index: number) {
    const text = sanitizeForPdf(item.story);
    if (!text) return;
    const padX = 14;
    const padY = 10;
    const badgeSpace = 26;
    const textX = margin + padX + badgeSpace;
    const textWidth = maxWidth - padX * 2 - badgeSpace;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.8);
    const lines = doc.splitTextToSize(text, textWidth);
    const lineHeight = 13.5;
    const cardHeight = Math.max(lines.length * lineHeight + padY * 2, 34);
    ensureSpace(cardHeight + 8);

    doc.setDrawColor(...BORDER);
    doc.setFillColor(...WHITE);
    doc.roundedRect(margin, y, maxWidth, cardHeight, 6, 6, "S");

    const badgeCx = margin + padX + 8;
    const badgeCy = y + padY + 5;
    doc.setFillColor(...STORY_COLOR);
    doc.circle(badgeCx, badgeCy, 9, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...WHITE);
    doc.text(String(index + 1), badgeCx, badgeCy + 3, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.8);
    doc.setTextColor(...BODY);
    doc.text(lines, textX, y + padY + 8);
    y += cardHeight + 8;
  }

  // ---- Build document ----
  drawHero();
  drawInputsSummary();

  drawSectionTitle("Fears", data.fears.length, FEAR_COLOR);
  data.fears.forEach((item) => addBulletCard(item, FEAR_COLOR));
  y += 10;

  drawSectionTitle("Frustrations", data.frustrations.length, FRUSTRATION_COLOR);
  data.frustrations.forEach((item) => addBulletCard(item, FRUSTRATION_COLOR));
  y += 10;

  drawSectionTitle("Dreams", data.dreams.length, DREAM_COLOR);
  data.dreams.forEach((item) => addBulletCard(item, DREAM_COLOR));
  y += 10;

  drawSectionTitle("Desires", data.desires.length, DESIRE_COLOR);
  data.desires.forEach((item) => addBulletCard(item, DESIRE_COLOR));
  y += 10;

  drawSectionTitle("Hooks", data.hooks.length, HOOK_COLOR);
  data.hooks.forEach((item, i) => addNumberedCard(item, i, HOOK_COLOR));
  y += 10;

  const stories = normalizeStories(data.stories);
  drawSectionTitle("Stories", stories.length, STORY_COLOR);
  stories.forEach((item, i) => addStoryCard(item, i));
  y += 10;

  drawSectionTitle("LinkedIn Posts", data.linkedin_posts.length, LINKEDIN_COLOR);
  data.linkedin_posts.forEach((item, i) => addNumberedCard(item, i, LINKEDIN_COLOR));
  y += 10;

  drawSectionTitle("Facebook Posts", data.facebook_posts.length, FACEBOOK_COLOR);
  data.facebook_posts.forEach((item, i) => addNumberedCard(item, i, FACEBOOK_COLOR));

  // ---- Footer on every page ----
  const totalPages = (doc.internal as unknown as { getNumberOfPages: () => number }).getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...BORDER);
    doc.line(margin, pageHeight - footerZone + 8, pageWidth - margin, pageHeight - footerZone + 8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text("Clarify - 6 Month Content Strategy", margin, pageHeight - 14);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 14, { align: "right" });
  }

  const filenameSafeAvatar = data.avatar
    .split(",")[0]
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .toLowerCase();

  doc.save(`content-strategy-${filenameSafeAvatar || "export"}.pdf`);
}
