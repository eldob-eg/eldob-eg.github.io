/**
 * El-Dob — شيت الحجوزات
 * ---------------------------------------------
 * الكود ده بيستقبل الحجوزات من الموقع ويكتب كل حجز في سطر جديد.
 * الصقه في: Extensions ← Apps Script ← Code.gs ، وبعدين Deploy ← Web app.
 */

// لو الكود مش جوه الشيت نفسه، حط هنا الـ ID بتاع الشيت (الجزء اللي بين /d/ و /edit في اللينك)
const SPREADSHEET_ID = '1crQZbPEI0M5xB8YjiOOfjwTQR5kqbmUB-JiBleiioac';
const SHEET_NAME = 'الحجوزات';
const HEADERS = ['وقت التسجيل', 'الاسم', 'الموبايل', 'يوم الحجز', 'الساعة', 'عدد الأفراد', 'الحلاق', 'الحالة', 'ملاحظات'];
const STATUSES = ['جديد', 'اتأكد', 'حضر', 'ما جاش', 'اتلغى'];

// عداد الزيارات: أرقام بس، من غير أي بيانات عن الناس
const STATS_NAME = 'الإحصائيات';
const EVENTS = ['visit', 'whatsapp', 'instapay', 'vodafone', 'location', 'booking', 'proof', 'instagram', 'facebook', 'tiktok', 'review', 'share', 'install'];
const EVENT_LABELS = ['التاريخ', 'زيارات', 'واتساب', 'إنستاباي', 'فودافون كاش', 'لوكيشن', 'حجوزات', 'سكرين الدفع', 'إنستجرام', 'فيسبوك', 'تيك توك', 'تقييم جوجل', 'مشاركة', 'تثبيت'];
const TZ = 'Africa/Cairo';

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (d.kind === 'event') { count_(d.event); return reply_({ ok: true }); }
    if (!d.name || !d.phone) return reply_({ ok: false, error: 'missing' });
    count_('booking');

    const sh = sheet_();
    sh.appendRow([
      new Date(),
      clean_(d.name),
      "'" + clean_(d.phone).replace(/^'/, ''),   // يفضل نص عشان الصفر اللي في الأول ما يضيعش
      clean_(d.day),
      clean_(d.time),
      clean_(d.count),
      clean_(d.barber || 'أي حد'),
      'جديد',
      ''
    ]);
    return reply_({ ok: true });
  } catch (err) {
    return reply_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// فتح اللينك في المتصفح بيقول إن الشيت شغال
function doGet(e) {
  if (e && e.parameter && e.parameter.stats) return reply_({ ok: true, days: statsDays_(Number(e.parameter.days) || 60) });
  return reply_({ ok: true, service: 'El-Dob bookings' });
}

// شغّل الدالة دي مرة واحدة من جوه Apps Script عشان تجهّز الشيت وتدّي الإذن
function setup() {
  sheet_();
  stats_();
}

function sheet_() {
  const ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME, 0);
    sh.setRightToLeft(true);
  }
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length)
      .setFontWeight('bold').setBackground('#1b1a18').setFontColor('#c9a46a');
    sh.getRange('A:A').setNumberFormat('yyyy-mm-dd hh:mm');
    sh.setColumnWidths(1, HEADERS.length, 140);
    // قايمة الحالة: جديد / اتأكد / حضر / ما جاش / اتلغى
    const rule = SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).build();
    sh.getRange(2, 8, 999, 1).setDataValidation(rule);
  }
  return sh;
}

function stats_() {
  const ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(STATS_NAME);
  if (!sh) {
    sh = ss.insertSheet(STATS_NAME);
    sh.setRightToLeft(true);
    sh.appendRow(EVENT_LABELS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, EVENT_LABELS.length).setFontWeight('bold').setBackground('#1b1a18').setFontColor('#c9a46a');
    sh.getRange('A:A').setNumberFormat('@');
  }
  return sh;
}

// بيزوّد العدد في سطر النهارده (سطر لكل يوم)
function count_(ev) {
  const col = EVENTS.indexOf(ev);
  if (col < 0) return;
  const sh = stats_();
  const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  let row = sh.getLastRow();
  if (row < 2 || String(sh.getRange(row, 1).getDisplayValue()) !== today) {
    const blank = [today].concat(EVENTS.map(function () { return 0; }));
    sh.appendRow(blank);
    row = sh.getLastRow();
  }
  const cell = sh.getRange(row, col + 2);
  cell.setValue((Number(cell.getValue()) || 0) + 1);
}

function statsDays_(n) {
  const sh = stats_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const from = Math.max(2, last - Math.min(n, 400) + 1);
  return sh.getRange(from, 1, last - from + 1, EVENTS.length + 1).getDisplayValues().map(function (r) {
    const o = { date: r[0] };
    EVENTS.forEach(function (k, i) { o[k] = Number(r[i + 1]) || 0; });
    return o;
  });
}

// يمنع أي حد يكتب معادلات في الشيت، ويقصّر النص الطويل
function clean_(v) {
  let s = String(v == null ? '' : v).trim().slice(0, 120);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
