/**
 * A real PDF file of the report. Phones are unreliable at printing a web page (no printer saved, in-app browsers,
 * print preview that stays blank), so the visitor can download this file instead. It is loaded only when the
 * button is pressed, so it does not slow down the calculator.
 */
export interface ReportPdfData {
  date: string;
  practice: string;
  owner: string;
  summaryLine: string;
  rows: [string, string][];
  insightLines: string[];
  alertText: string;
  thresholdNote: string;
  assumptions: string;
}

export async function buildReportPdf(d: ReportPdfData): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48;
  const maxW = W - M * 2;
  let y = M;

  const ensure = (h: number) => { if (y + h > H - M) { doc.addPage(); y = M; } };
  const para = (text: string, size: number, bold = false, gap = 6) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, maxW) as string[];
    for (const line of lines) { ensure(size * 1.3); doc.text(line, M, y + size); y += size * 1.3; }
    y += gap;
  };

  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
  doc.text('MONIQUE REID BOOKKEEPING', W / 2, y + 20, { align: 'center' });
  y += 30;
  doc.setFontSize(10);
  doc.text('TREATMENT PROFITABILITY DIAGNOSTIC', W / 2, y + 10, { align: 'center' });
  y += 20;
  doc.setLineWidth(2); doc.line(M, y, W - M, y); y += 14;

  para(`Report date: ${d.date}`, 10, false, 2);
  para(`Practice: ${d.practice}   Prepared for: ${d.owner}`, 10, false, 2);
  para(d.summaryLine, 10, false, 12);

  doc.setLineWidth(1);
  for (const [label, value] of d.rows) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    const lines = doc.splitTextToSize(label, maxW - 110) as string[];
    ensure(lines.length * 15 + 6);
    lines.forEach((line, i) => doc.text(line, M, y + 11 + i * 14));
    doc.text(value, W - M, y + 11, { align: 'right' });
    y += lines.length * 14 + 6;
  }
  y += 6; ensure(10); doc.line(M, y, W - M, y); y += 12;

  for (const line of d.insightLines) para(line, 10.5, false, 4);
  y += 6;
  para(d.alertText, 11, true, 4);
  para(d.thresholdNote, 8.5, false, 10);
  para('Assumptions and limitations', 9, true, 2);
  para(d.assumptions, 8.5, false, 8);
  para('Monique Reid Bookkeeping • Secure Virtual Solutions • medspa.moniquereidbookkeeping.com', 8.5, true, 0);

  return doc.output('blob');
}
