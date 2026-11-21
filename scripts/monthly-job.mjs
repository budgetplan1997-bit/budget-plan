// Runs on GitHub every month (see .github/workflows/monthly-job.yml).
// 1. Makes sure every user's monthly deductions are recorded (even if nobody opened the app).
// 2. In January, emails each user a PDF summary of the year that just ended.
//
// Secrets it needs (set in GitHub > Settings > Secrets and variables > Actions):
//   FIREBASE_SERVICE_ACCOUNT  - the whole JSON key file from Firebase
//   GMAIL_USER                - the Gmail address that sends the report
//   GMAIL_APP_PASSWORD        - a 16-letter Google "App password" for that Gmail

import admin from "firebase-admin";
import PDFDocument from "pdfkit";
import nodemailer from "nodemailer";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const pad = n => String(n).padStart(2, "0");
const r2 = n => Math.round(n * 100) / 100;
const K = n => (n < 0 ? "-K" : "K") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Papua New Guinea time (UTC+10, no daylight saving)
const png = new Date(Date.now() + 10 * 3600 * 1000);
const nowY = png.getUTCFullYear(), nowM = png.getUTCMonth() + 1;

const mode = process.env.MODE || "auto";              // auto | deductions | report
const reportYear = Number(process.env.REPORT_YEAR) || (nowM === 1 ? nowY - 1 : nowY);
const sendReport = mode === "report" || (mode === "auto" && nowM === 1);
const onlyUser = (process.env.ONLY_USER || "").trim().toLowerCase();

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();

function totals(list) {
  const t = { income: 0, savings: 0, needs: 0, wants: 0, dedS: 0, dedW: 0, inS: 0, inN: 0, inW: 0 };
  for (const e of list) {
    t.savings += e.savings || 0; t.needs += e.needs || 0; t.wants += e.wants || 0;
    if (e.type === "income") { t.income += e.amount || 0; t.inS += e.savings || 0; t.inN += e.needs || 0; t.inW += e.wants || 0; }
    else { t.dedS += -(e.savings || 0); t.dedW += -(e.wants || 0); }
  }
  for (const k in t) t[k] = r2(t[k]);
  return t;
}

async function ensureDeductions(uid, profile, existingIds) {
  const ded = { savings: 10, wants: 5, ...(profile.deductions || {}) };
  const start = profile.deductionStart || `${nowY}-${pad(nowM)}`;
  const [sy, sm] = start.split("-").map(Number);
  const batch = db.batch();
  const added = [];
  for (let key = sy * 12 + (sm - 1); key <= nowY * 12 + (nowM - 1); key++) {
    const y = Math.floor(key / 12), m = (key % 12) + 1;
    const id = `ded-${y}-${pad(m)}`;
    if (existingIds.has(id)) continue;
    const data = { type: "deduction", date: `${y}-${pad(m)}-01`, amount: 0, savings: -ded.savings, needs: 0, wants: -ded.wants,
      note: "Monthly deduction", createdAt: admin.firestore.FieldValue.serverTimestamp() };
    batch.set(db.doc(`users/${uid}/entries/${id}`), data);
    added.push({ id, ...data });
  }
  if (added.length) await batch.commit();
  return added;
}

// ---------- PDF (A4). Rows never split across pages; headers repeat on new pages. ----------
function buildPdf(profile, year, list) {
  return new Promise(resolve => {
    const pdf = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
    const chunks = []; pdf.on("data", c => chunks.push(c)); pdf.on("end", () => resolve(Buffer.concat(chunks)));
    const W = pdf.page.width, L = 40, R = W - 40, BOTTOM = pdf.page.height - 50;
    const green = "#14532d";
    const t = totals(list);

    pdf.rect(0, 0, W, 78).fill(green);
    pdf.fill("#fff").font("Helvetica-Bold").fontSize(20).text(`Budget Plan - ${year} Annual Report`, L, 24);
    pdf.font("Helvetica").fontSize(10).text(`User: ${profile.username}     Generated: ${nowY}-${pad(nowM)}-${pad(png.getUTCDate())}`, L, 52);
    let y = 96;

    function table(title, cols, rows, opts = {}) {
      const rowH = opts.rowH || 18, fs = opts.fs || 9;
      const needed = 22 + rowH * Math.min(rows.length + 1, 4);   // keep title with header + first rows
      if (y + needed > BOTTOM) { pdf.addPage(); y = 40; }
      pdf.fill(green).font("Helvetica-Bold").fontSize(12).text(title, L, y); y += 18;
      const header = () => {
        pdf.rect(L, y, R - L, rowH).fill(green);
        let x = L; pdf.fill("#fff").font("Helvetica-Bold").fontSize(fs);
        cols.forEach(c => { pdf.text(c.h, x + 4, y + 5, { width: c.w - 8, align: c.a || "left", lineBreak: false }); x += c.w; });
        y += rowH;
      };
      header();
      rows.forEach((r, i) => {
        if (y + rowH > BOTTOM) { pdf.addPage(); y = 40; header(); }
        if (i % 2) pdf.rect(L, y, R - L, rowH).fill("#eef3ef");
        let x = L; pdf.fill("#1c2a22").font(r.bold ? "Helvetica-Bold" : "Helvetica").fontSize(fs);
        cols.forEach((c, j) => { pdf.text(String(r.cells[j] ?? ""), x + 4, y + 5, { width: c.w - 8, align: c.a || "left", lineBreak: false, ellipsis: true }); x += c.w; });
        y += rowH;
      });
      y += 16;
    }

    table("Summary", [{ h: "Item", w: 330 }, { h: "Amount", w: R - L - 330, a: "right" }], [
      ["Total income received", K(t.income)], ["Put into Savings", K(t.inS)], ["Put into Needs", K(t.inN)], ["Put into Wants", K(t.inW)],
      ["Monthly deductions from Savings", K(-t.dedS)], ["Monthly deductions from Wants", K(-t.dedW)],
      ["Savings - net for the year", K(t.savings)], ["Needs - net for the year", K(t.needs)], ["Wants - net for the year", K(t.wants)]
    ].map((c, i) => ({ cells: c, bold: i === 0 || i > 5 })), { rowH: 20, fs: 10 });

    const mw = (R - L - 110) / 4;
    table("Month by month (net, after deductions)",
      [{ h: "Month", w: 110 }, { h: "Income", w: mw, a: "right" }, { h: "Savings", w: mw, a: "right" }, { h: "Needs", w: mw, a: "right" }, { h: "Wants", w: mw, a: "right" }],
      [...MONTHS.map((m, i) => { const mt = totals(list.filter(e => e.date.slice(5, 7) === pad(i + 1))); return { cells: [m, K(mt.income), K(mt.savings), K(mt.needs), K(mt.wants)] }; }),
       { cells: ["TOTAL", K(t.income), K(t.savings), K(t.needs), K(t.wants)], bold: true }]);

    const ew = (R - L - 70 - 60 - 110) / 4;
    table("Every entry",
      [{ h: "Date", w: 70 }, { h: "Type", w: 60 }, { h: "Amount", w: ew, a: "right" }, { h: "Savings", w: ew, a: "right" },
       { h: "Needs", w: ew, a: "right" }, { h: "Wants", w: ew, a: "right" }, { h: "Note", w: 110 }],
      list.map(e => ({ cells: [e.date, e.type === "income" ? "Income" : "Deduction", e.type === "income" ? K(e.amount) : "-",
        K(e.savings || 0), K(e.needs || 0), K(e.wants || 0), e.note || ""] })), { rowH: 16, fs: 8 });

    const range = pdf.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      pdf.switchToPage(i);
      pdf.page.margins.bottom = 0;
      pdf.fill("#888").font("Helvetica").fontSize(8).text(`Page ${i + 1} of ${range.count}`, L, pdf.page.height - 30, { width: R - L, align: "right", lineBreak: false });
    }
    pdf.end();
  });
}

const mailer = sendReport ? nodemailer.createTransport({
  service: "gmail", auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
}) : null;

console.log(`PNG date ${nowY}-${pad(nowM)} | mode=${mode} | sendReport=${sendReport} | reportYear=${reportYear}`);
const users = await db.collection("users").get();
let failures = 0;
for (const u of users.docs) {
  const profile = u.data();
  if (onlyUser && profile.username !== onlyUser) continue;
  try {
    const snap = await db.collection(`users/${u.id}/entries`).get();
    const entries = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const added = await ensureDeductions(u.id, profile, new Set(entries.map(e => e.id)));
    entries.push(...added);
    console.log(`${profile.username}: ${entries.length} entries, ${added.length} deduction(s) added`);
    if (sendReport) {
      if (!profile.reportEmail) { console.log(`  no report email set - skipped`); continue; }
      const list = entries.filter(e => (e.date || "").startsWith(String(reportYear))).sort((a, b) => a.date.localeCompare(b.date));
      const t = totals(list);
      const pdf = await buildPdf(profile, reportYear, list);
      await mailer.sendMail({
        from: `"Budget Plan" <${process.env.GMAIL_USER}>`, to: profile.reportEmail,
        subject: `Your Budget Plan report for ${reportYear}`,
        text: `Hi ${profile.username},\n\nYour ${reportYear} budget summary is attached.\n\n` +
          `Total income: ${K(t.income)}\nSavings (net): ${K(t.savings)}\nNeeds (net): ${K(t.needs)}\nWants (net): ${K(t.wants)}\n\n- Budget Plan`,
        attachments: [{ filename: `BudgetPlan_${profile.username}_${reportYear}.pdf`, content: pdf }]
      });
      console.log(`  report emailed to ${profile.reportEmail}`);
    }
  } catch (e) { failures++; console.error(`  FAILED for ${profile.username}:`, e.message); }
}
if (failures) process.exit(1);
