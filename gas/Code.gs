/**
* ============================================================================
*  APP QUAY VIDEO XÁC NHẬN ĐƠN HÀNG - BACKEND (Google Apps Script)
* ============================================================================
*  Script này KHÔNG lưu video đi qua nó. Nó chỉ:
*   1) Trả về danh sách "Người gọi" / "Lý do" cho web app hiển thị dropdown.
*   2) Mở một "phiên upload resumable" tới Google Drive bằng quyền của CHỦ SỞ
*      HỮU script (tức là mày) rồi đưa link đó cho trình duyệt nhân viên tự
*      đẩy video thẳng lên Drive. => Video luôn tính vào dung lượng Drive của
*      MÀY (5TB), KHÔNG tính vào Drive của nhân viên, và nhân viên KHÔNG cần
*      đăng nhập Google.
*   3) Ghi 1 dòng dữ liệu vào Google Sheet sau khi nhân viên upload xong.
*
*  CÁCH DEPLOY (chi tiết xem file HUONG_DAN_CAI_DAT.md):
*   - Triển khai > Triển khai mới > Loại: Ứng dụng web
*   - Execute as: Me (chính mày)
*   - Who has access: Anyone (bất kỳ ai có link, kể cả không có tài khoản Google)
*   - Lần đầu deploy sẽ phải cấp quyền Drive + Sheet cho CHÍNH MÀY (chỉ 1 lần).
* ============================================================================
*/

// ==== CẤU HÌNH - đã điền sẵn theo link mày gửi, có thể sửa lại nếu cần ====
var SHEET_ID = '1DXjcKtcnbdGc55Pwt2dykwDpMnYeiTBnRgQIpQPXiBc';
var SHEET_TAB_NAME = 'Data';           // tên tab (trang tính) sẽ ghi dữ liệu
var CONFIG_TAB_NAME = 'Config';        // tên tab chứa danh sách Người gọi / Lý do
var DRIVE_FOLDER_ID = '1ko_o8ZsCOq3OcZ7kqmzGjzzSYg9FmeX-';

// Mã truy cập nội bộ đơn giản: vì link web app này để "Anyone" truy cập
// (để nhân viên không cần đăng nhập Google), mã này giúp chặn người ngoài
// lỡ có link vẫn không tự ý upload/ghi được dữ liệu. Đặt trùng với
// ACCESS_CODE trong file web/config.js. Đổi thành chuỗi riêng của mày.
var ACCESS_CODE = 'DOISO-MA-BI-MAT-2026';

// Danh sách dự phòng nếu chưa tạo tab "Config" trong Sheet
var FALLBACK_CALLERS = ['Nhân viên A', 'Nhân viên B'];
var FALLBACK_REASONS = [
'Khách đã xác nhận nhận hàng',
'Không nghe máy',
'Thuê bao không liên lạc được',
'Khách từ chối nhận hàng',
'Khách hẹn gọi lại',
'Sai số điện thoại',
'Khác'
];

// ============================================================================
// doGet - dùng để lấy config (?action=config) hoặc kiểm tra script còn sống
// ============================================================================
function doGet(e) {
var action = e.parameter.action || '';
if (action === 'config') {
return jsonOut(getConfigData_());
}
return jsonOut({ ok: true, message: 'GAS backend cho app quay video xác nhận đơn hàng đang chạy.' });
}

// ============================================================================
// doPost - nhận JSON qua body (gửi dạng text/plain để tránh CORS preflight)
//   { action: 'initUpload', fileName, mimeType }
//   { action: 'logRow', orderCode, callerName, callDate, reason, fileName,
//               fileId, fileUrl, staffNote }
// ============================================================================
function doPost(e) {
var body = {};
try {
body = JSON.parse(e.postData.contents);
} catch (err) {
return jsonOut({ ok: false, error: 'Payload không hợp lệ: ' + err });
}

if (ACCESS_CODE && body.accessCode !== ACCESS_CODE) {
return jsonOut({ ok: false, error: 'Sai mã truy cập. Liên hệ quản lý để lấy mã đúng.' });
}

var action = body.action;
try {
if (action === 'initUpload') {
return jsonOut(initUpload_(body));
}
if (action === 'logRow') {
return jsonOut(logRow_(body));
}
return jsonOut({ ok: false, error: 'action không hợp lệ: ' + action });
} catch (err) {
return jsonOut({ ok: false, error: String(err) });
}
}

// ============================================================================
// Mở phiên upload resumable lên Drive, chạy với quyền script owner.
// Trả về sessionUrl để trình duyệt PUT trực tiếp từng chunk video lên đó.
// ============================================================================
function initUpload_(body) {
var fileName = sanitizeFileName_(body.fileName || 'video.mp4');
var mimeType = body.mimeType || 'video/mp4';

var url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,webViewLink';
var metadata = {
name: fileName,
parents: [DRIVE_FOLDER_ID]
};

var response = UrlFetchApp.fetch(url, {
method: 'post',
contentType: 'application/json; charset=UTF-8',
payload: JSON.stringify(metadata),
headers: {
Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
'X-Upload-Content-Type': mimeType
},
muteHttpExceptions: true
});

var code = response.getResponseCode();
if (code !== 200) {
return { ok: false, error: 'Không mở được phiên upload Drive (HTTP ' + code + '): ' + response.getContentText() };
}

var sessionUrl = response.getHeaders()['Location'] || response.getHeaders()['location'];
if (!sessionUrl) {
return { ok: false, error: 'Google không trả về session URL.' };
}

return { ok: true, sessionUrl: sessionUrl, fileName: fileName };
}

// ============================================================================
// Ghi 1 dòng vào Google Sheet sau khi upload video thành công
// ============================================================================
function logRow_(body) {
var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_TAB_NAME);
if (!sheet) {
sheet = SpreadsheetApp.openById(SHEET_ID).insertSheet(SHEET_TAB_NAME);
sheet.appendRow([
'Thời gian ghi nhận', 'Mã đơn hàng', 'Người gọi', 'Ngày gọi',
'Lý do / Kết quả cuộc gọi', 'Ghi chú', 'Tên file video', 'Link video Drive', 'ID file Drive'
]);
sheet.setFrozenRows(1);
}

var orderCode = String(body.orderCode || '').toUpperCase().trim();

sheet.appendRow([
new Date(),
orderCode,
body.callerName || '',
body.callDate || '',
body.reason || '',
body.staffNote || '',
body.fileName || '',
body.fileUrl || '',
body.fileId || ''
]);

return { ok: true };
}

// ============================================================================
// Đọc danh sách Người gọi / Lý do từ tab "Config" (cột A = Người gọi, cột B = Lý do)
// Nếu chưa có tab Config thì dùng danh sách mặc định ở trên.
// ============================================================================
function getConfigData_() {
try {
var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(CONFIG_TAB_NAME);
if (!sheet) {
return { ok: true, callers: FALLBACK_CALLERS, reasons: FALLBACK_REASONS, usingFallback: true };
}
var lastRow = sheet.getLastRow();
if (lastRow < 2) {
return { ok: true, callers: FALLBACK_CALLERS, reasons: FALLBACK_REASONS, usingFallback: true };
}
var values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
var callers = [];
var reasons = [];
values.forEach(function (row) {
if (row[0] && String(row[0]).trim() !== '') callers.push(String(row[0]).trim());
if (row[1] && String(row[1]).trim() !== '') reasons.push(String(row[1]).trim());
});
if (callers.length === 0) callers = FALLBACK_CALLERS;
if (reasons.length === 0) reasons = FALLBACK_REASONS;
return { ok: true, callers: callers, reasons: reasons, usingFallback: false };
} catch (err) {
return { ok: true, callers: FALLBACK_CALLERS, reasons: FALLBACK_REASONS, usingFallback: true, error: String(err) };
}
}

function sanitizeFileName_(name) {
return String(name).replace(/[\\/:*?"<>|]/g, '_').trim();
}

// ContentService JSON output. Apps Script tự thêm header CORS cho phản hồi
// của web app nên không cần set thủ công Access-Control-Allow-Origin.
function jsonOut(obj) {
return ContentService.createTextOutput(JSON.stringify(obj))
.setMimeType(ContentService.MimeType.JSON);
}
