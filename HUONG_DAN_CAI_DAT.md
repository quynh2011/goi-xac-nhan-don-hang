# Hướng dẫn cài đặt — App Quay Video Xác Nhận Đơn Hàng

## 1. App này hoạt động thế nào

- **Trang web** (chạy trên điện thoại nhân viên, mở bằng trình duyệt, không cần cài app): quét mã đơn / nhập tay, chọn người gọi, ngày gọi, lý do, quay video bằng camera điện thoại.
- **Google Apps Script** (chạy trên tài khoản Google của mày): "mở khóa" một đường upload thẳng lên Drive, rồi ghi thông tin vào Google Sheet.
- Video đi **thẳng từ điện thoại nhân viên lên Google Drive**, không đi qua máy chủ trung gian nào — nhanh, không giới hạn dung lượng, và **luôn tính vào 5TB Drive của mày** (vì Apps Script mở đường bằng quyền của mày).
- Nhân viên **không cần đăng nhập Google**, chỉ cần mở link web là dùng được.
- Vì link ở dạng "ai có link cũng vào được" (để khỏi bắt nhân viên đăng nhập), app có thêm **1 mã truy cập nội bộ** để chặn người lạ lỡ có link.

Cần làm 3 việc: **(A)** chuẩn bị Google Sheet, **(B)** deploy Apps Script, **(C)** đưa trang web lên GitHub Pages.

---

## A. Chuẩn bị Google Sheet

Sheet của mày: https://docs.google.com/spreadsheets/d/1DXjcKtcnbdGc55Pwt2dykwDpMnYeiTBnRgQIpQPXiBc/edit

1. Tab **"Data"** (chứa kết quả các cuộc gọi) — **không cần tạo tay**, Apps Script sẽ tự tạo tab này và tự thêm dòng tiêu đề trong lần ghi dữ liệu đầu tiên.
2. Tab **"Config"** (danh sách "Người gọi" và "Lý do" hiện trong app) — **mày cần tự tạo**:
- Tạo 1 tab mới, đặt tên đúng là `Config`.
- Cột A, dòng 1: `Người gọi` (tiêu đề) — từ dòng 2 trở đi liệt kê tên từng nhân viên, mỗi tên 1 dòng.
- Cột B, dòng 1: `Lý do` (tiêu đề) — từ dòng 2 trở đi liệt kê các lý do/kết quả cuộc gọi.
- Ví dụ:

| Người gọi | Lý do |
|---|---|
| Nguyễn Văn A | Khách đã xác nhận nhận hàng |
| Trần Thị B | Không nghe máy |
|  | Thuê bao không liên lạc được |
|  | Khách từ chối nhận hàng |
|  | Khách hẹn gọi lại |
|  | Sai số điện thoại |

- App tự thêm sẵn lựa chọn "Khác (nhập tay)" ở phần Lý do, không cần thêm vào Sheet.
- Nếu chưa kịp tạo tab này, app vẫn chạy được với danh sách mặc định có sẵn trong code, nhưng nên tạo sớm để đúng tên nhân viên thật.

---

## B. Deploy Apps Script (Code.gs)

1. Mở Google Sheet ở trên → menu **Tiện ích mở rộng (Extensions) → Apps Script**.
2. Xóa hết code mẫu (`myFunction(){}`) đang có sẵn, dán toàn bộ nội dung file **`gas/Code.gs`** (trong gói mày tải về) vào.
3. Bật xem file cấu hình quyền: nhấn biểu tượng ⚙️ **Cài đặt dự án (Project Settings)** ở menu bên trái → tick chọn **"Show appsscript.json manifest file in editor"**. Quay lại menu **Trình chỉnh sửa (Editor)**, sẽ thấy xuất hiện file `appsscript.json` → mở ra, xóa hết nội dung, dán nội dung file **`gas/appsscript.json`** (trong gói tải về) vào rồi Lưu.
> Bước này quan trọng: nó khai báo rõ quyền Drive cần thiết, vì script gọi thẳng Drive API (không qua dịch vụ mặc định) nên Apps Script không tự nhận diện được quyền cần cấp nếu thiếu bước này.
4. Kiểm tra 2 dòng cấu hình đầu file `Code.gs` đã đúng chưa (đã điền sẵn theo link mày gửi, thường không cần sửa):
```js
var SHEET_ID = '1DXjcKtcnbdGc55Pwt2dykwDpMnYeiTBnRgQIpQPXiBc';
var DRIVE_FOLDER_ID = '1ko_o8ZsCOq3OcZ7kqmzGjzzSYg9FmeX-';
```
5. **Đổi mã truy cập** cho riêng công ty mày (dòng `ACCESS_CODE = '...'`) — đặt 1 chuỗi khó đoán, ví dụ tên công ty + số ngẫu nhiên. **Nhớ dùng đúng chuỗi này ở bước C.**
6. Nhấn biểu tượng 💾 **Lưu**.
7. Nhấn **Triển khai (Deploy) → Triển khai mới (New deployment)**.
- Loại (Select type): chọn **Ứng dụng web (Web app)**.
- Execute as: **Me (tài khoản của mày)** — bắt buộc chọn cái này, không chọn "User accessing".
- Who has access: **Anyone** (bất kỳ ai có link).
- Nhấn **Deploy**.
8. Lần đầu deploy, Google sẽ hỏi cấp quyền (Authorize access) — đăng nhập bằng tài khoản Google chủ Sheet/Drive của mày, bấm **Advanced → Go to (tên project) (unsafe)** nếu thấy cảnh báo "Google chưa xác minh app" (bình thường, vì đây là script riêng của mày, chỉ mày cấp quyền 1 lần duy nhất).
9. Sau khi deploy xong, copy **URL Web app** (dạng `https://script.google.com/macros/s/xxxxxxxx/exec`). Giữ lại URL này cho bước C.

> Mỗi lần mày sửa code trong Apps Script sau này, phải vào lại **Deploy → Manage deployments → biểu tượng bút chì → New version → Deploy** thì thay đổi mới có hiệu lực (sửa code không tự cập nhật vào URL đang chạy).

---

## C. Đưa trang web lên GitHub Pages

1. Mở file **`web/config.js`** trong gói tải về, sửa 2 chỗ:
```js
GAS_WEB_APP_URL: 'https://script.google.com/macros/s/xxxxxxxx/exec', // URL lấy ở bước B.8
ACCESS_CODE: 'DOISO-MA-BI-MAT-2026', // PHẢI trùng khớp với ACCESS_CODE đã đổi trong Code.gs
```
2. Tạo 1 repository mới trên GitHub (Public hoặc Private đều được, GitHub Pages free hỗ trợ cả 2 nếu tài khoản có GitHub Pro; nếu account free thì repo Public mới bật được Pages).
3. Upload toàn bộ file trong thư mục **`web/`** (index.html, styles.css, app.js, config.js, manifest.json) lên **thư mục gốc** của repo đó (kéo-thả file trên giao diện GitHub cũng được, không cần biết dùng Git).
4. Vào **Settings → Pages** của repo:
- Source: chọn nhánh (thường là `main`), thư mục `/ (root)`.
- Nhấn Save. Đợi khoảng 1 phút, GitHub sẽ cấp 1 link dạng `https://<tên-tài-khoản>.github.io/<tên-repo>/`.
5. Mở link đó **trên điện thoại** (ưu tiên test trên iPhone trước vì Safari khó tính hơn Chrome):
- Trình duyệt sẽ hỏi quyền Camera + Micro → chọn **Cho phép (Allow)**.
- Thử bấm "Quét mã" quét thử 1 mã bất kỳ.
- Thử "Mở camera" → "Bắt đầu quay" → quay vài giây → "Dừng quay" → xem lại video.
- Điền đủ Người gọi / Ngày gọi / Lý do → bấm "Tải lên Drive" → chờ thanh tiến trình chạy hết.
- Kiểm tra: video xuất hiện trong đúng folder Drive, đặt tên đúng = mã đơn hàng viết hoa; 1 dòng mới xuất hiện trong tab "Data" của Sheet.

6. (Khuyến nghị) Trên iPhone, sau khi mở link, chọn **Chia sẻ (nút vuông có mũi tên) → Thêm vào MH chính (Add to Home Screen)** — app sẽ có icon riêng, mở lên gần như app thật, không cần gõ link mỗi lần.

---

## Một vài lưu ý quan trọng

- **Không đăng công khai link GitHub Pages / link Apps Script** ở nơi ai cũng xem được (ví dụ Facebook, group công khai) — tuy có mã truy cập bảo vệ, nhưng đây là bảo vệ ở mức cơ bản (mã nằm trong code JS, người rành kỹ thuật vẫn có thể xem được), không phải bảo mật cấp doanh nghiệp. Chỉ gửi link riêng cho nhân viên qua Zalo/nội bộ.
- **Tên file trùng nhau**: nếu 1 mã đơn được quay video 2 lần (gọi lại), Drive sẽ lưu 2 file cùng tên (Drive cho phép trùng tên) — cột "Thời gian ghi nhận" trong Sheet giúp phân biệt file nào mới hơn.
- **Giới hạn Apps Script**: mỗi tài khoản Google có hạn mức Drive API/Apps Script theo ngày (rất cao, hàng chục nghìn request/ngày) — với quy mô vài chục nhân viên gọi vài chục đơn/ngày thì không lo chạm giới hạn.
- **Nếu video bị lỗi giữa chừng khi upload** (mất mạng, tắt màn hình...): app tự retry từng phần đã gửi dở, nhưng nếu thoát hẳn trình duyệt phải quay lại và upload lại từ đầu (phiên bản này chưa lưu video tạm khi thoát app — có thể nâng cấp sau nếu cần).
- **iPhone cũ / Safari quá cũ**: MediaRecorder (quay video trong trình duyệt) cần iOS 14.3 trở lên. Nếu máy quá cũ không quay được, cần cập nhật iOS.

## Hướng nâng cấp có thể làm sau (nếu cần)

- Thêm màn hình đăng nhập bằng mã nhân viên (không chỉ 1 mã chung) để biết chính xác ai upload video nào.
- Lưu video tạm trên máy (IndexedDB) để không mất video nếu mất mạng giữa chừng.
- Thêm icon riêng cho app (hiện app dùng icon mặc định của trình duyệt).
- Gửi thông báo Zalo/Telegram tự động mỗi khi có video mới upload.

Nếu cần làm thêm phần nào ở trên, cứ nhắn lại.
