// ============================================================================
// CẤU HÌNH WEB APP - điền URL sau khi deploy Apps Script (xem HUONG_DAN_CAI_DAT.md)
// ============================================================================
window.APP_CONFIG = {
  // Dán URL "Web app" lấy được sau khi Deploy Apps Script vào đây.
  // Dạng: https://script.google.com/macros/s/XXXXXXXXXXXXXXXX/exec
  GAS_WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbztbGrnNqsRfU5RrPUHt-dpoILGV9ejVrhDEQSgU2-moOQK_1myT9dgQNREO3kc0qIK/exec',

  // Kích thước mỗi chunk khi upload video (byte). 8MB là mức cân bằng tốt
  // giữa tốc độ và độ ổn định trên mạng di động.
  CHUNK_SIZE: 8 * 1024 * 1024,

  // Phải TRÙNG KHỚP với ACCESS_CODE trong gas/Code.gs, để chặn người
  // ngoài lỡ có link web app vẫn không tự upload/ghi dữ liệu được.
  ACCESS_CODE: 'DOISO-MA-BI-MAT-2026',

  // Tên hiển thị của app
  APP_NAME: 'Quay Video Xác Nhận Đơn Hàng'
  };
