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

const PRIMARY: [number, number, number] = [0, 103, 255];
const HEADING: [number, number, number] = [15, 23, 42];
const BODY: [number, number, number] = [54, 65, 81];
const BORDER: [number, number, number] = [209, 218, 229];

function normalizeStories(stories: unknown[]): string[] {
  return (stories || []).map((item) => {
    if (typeof item === "object" && item !== null && typeof (item as any).story === "string") {
      return (item as any).story as string;
    }
    if (typeof item === "string") {
      try {
        const parsed = JSON.parse(item);
        if (parsed?.story) return parsed.story as string;
      } catch {
        // not JSON, treat as plain string
      }
      return item;
    }
    return String(item);
  });
}

export function downloadStrategyPdf(data: PdfStrategyData) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  function ensureSpace(needed: number) {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  }

  function addSectionTitle(title: string) {
    ensureSpace(34);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...PRIMARY);
    doc.text(title, margin, y);
    y += 8;
    doc.setDrawColor(...BORDER);
    doc.line(margin, y, pageWidth - margin, y);
    y += 18;
  }

  function addItem(text: string, index?: number) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(...BODY);
    const prefix = index !== undefined ? `${index + 1}. ` : "";
    const lines = doc.splitTextToSize(prefix + text, maxWidth);
    const lineHeight = 14;
    ensureSpace(lines.length * lineHeight + 8);
    doc.text(lines, margin, y);
    y += lines.length * lineHeight + 8;
  }

  function addLabeledField(label: string, value: string) {
    ensureSpace(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(...HEADING);
    doc.text(label, margin, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...BODY);
    const lines = doc.splitTextToSize(value, maxWidth);
    ensureSpace(lines.length * 14 + 12);
    doc.text(lines, margin, y);
    y += lines.length * 14 + 14;
  }

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...HEADING);
  doc.text("6 Months Content Strategy", margin, y);
  y += 26;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...BODY);
  const generatedDate = (() => {
    try {
      return new Date(data.generated_at).toLocaleString();
    } catch {
      return data.generated_at;
    }
  })();
  doc.text(`Generated ${generatedDate}`, margin, y);
  y += 26;

  // Inputs
  addLabeledField("Avatar", data.avatar);
  addLabeledField("Services / Profession", data.services_profession);
  addLabeledField("Audience", data.audience);
  y += 8;

  // Sections
  addSectionTitle("Fears");
  data.fears.forEach((item) => addItem(item));

  addSectionTitle("Frustrations");
  data.frustrations.forEach((item) => addItem(item));

  addSectionTitle("Dreams");
  data.dreams.forEach((item) => addItem(item));

  addSectionTitle("Desires");
  data.desires.forEach((item) => addItem(item));

  addSectionTitle("Hooks");
  data.hooks.forEach((item, i) => addItem(item, i));

  addSectionTitle("Stories");
  normalizeStories(data.stories).forEach((item, i) => addItem(item, i));

  addSectionTitle("LinkedIn Posts");
  data.linkedin_posts.forEach((item, i) => addItem(item, i));

  addSectionTitle("Facebook Posts");
  data.facebook_posts.forEach((item, i) => addItem(item, i));

  const filenameSafeAvatar = data.avatar
    .split(",")[0]
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .toLowerCase();

  doc.save(`content-strategy-${filenameSafeAvatar || "export"}.pdf`);
}
