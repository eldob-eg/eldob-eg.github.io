/**
 * El-Dob — شيت الحجوزات
 * ---------------------------------------------
 * الكود ده بيستقبل الحجوزات من الموقع ويكتب كل حجز في سطر جديد.
 * الصقه في: Extensions ← Apps Script ← Code.gs ، وبعدين Deploy ← Web app.
 */

// لو الكود مش جوه الشيت نفسه، حط هنا الـ ID بتاع الشيت (الجزء اللي بين /d/ و /edit في اللينك)
const SPREADSHEET_ID = '';
const SHEET_NAME = 'الحجوزات';
const HEADERS = ['وقت التسجيل', 'الاسم', 'الموبايل', 'يوم الحجز', 'الساعة', 'عدد الأفراد', 'الحلاق', 'الحالة', 'ملاحظات'];
const STATUSES = ['جديد', 'اتأكد', 'حضر', 'ما جاش', 'اتلغى'];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!d.name || !d.phone) return reply_({ ok: false, error: 'missing' });

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
function doGet() {
  return reply_({ ok: true, service: 'El-Dob bookings' });
}

// شغّل الدالة دي مرة واحدة من جوه Apps Script عشان تجهّز الشيت وتدّي الإذن
function setup() {
  sheet_();
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

// يمنع أي حد يكتب معادلات في الشيت، ويقصّر النص الطويل
function clean_(v) {
  let s = String(v == null ? '' : v).trim().slice(0, 120);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
