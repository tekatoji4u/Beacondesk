# BeaconDesk

Bộ công cụ văn phòng chạy hoàn toàn trong trình duyệt, dùng được trên máy tính, điện thoại và máy tính bảng, có mạng hay mất mạng đều được. Tài liệu không rời khỏi thiết bị: không có máy chủ nhận tệp, không quảng cáo, không theo dõi.

## Chức năng

| Nhóm | Nội dung |
|---|---|
| Công cụ PDF (20) | Ghép, tách, sắp xếp, trích, xoay, xoá trang; nén; scan ảnh chụp thành PDF (tự tìm khung, nắn phẳng, khử bóng, màu/xám/đen trắng, lớp chữ OCR); PDF → ảnh; ký và đóng dấu bằng hình ảnh; watermark; đánh số trang; đầu/chân trang và Bates; cắt lề; màu nền; thông tin tài liệu; chuyển sang Word, Excel |
| Scan / ảnh → chữ | Nhận dạng chữ tiếng Việt (Tesseract) từ ảnh, ảnh chụp, HEIC, PDF scan; tự xoay, chỉnh nghiêng, khử bóng; xuất Word, TXT, PDF tìm kiếm được |
| Soạn văn bản | 8 loại văn bản hành chính theo Nghị định 30/2020/NĐ-CP, xem trước khổ A4, xuất Word đúng thể thức |
| Kiểm tra văn bản | Thể thức (khổ giấy, lề, phông, cỡ chữ, các thành phần bắt buộc), chính tả tiếng Việt, dấu câu, khoảng trắng; sửa nhanh |
| Đổi tên hàng loạt | Mẫu tên, đánh số, tìm và thay, bỏ dấu; xem trước, ghi vào thư mục hoặc tải ZIP |
| Tạo PowerPoint | Từ dàn ý, Word hoặc PDF; 5 bảng màu |
| Tóm tắt & dàn ý | Tóm tắt trích câu ngay trên máy; tuỳ chọn tóm tắt bằng Claude (AI) khi người dùng tự bật |
| In ấn PDF A4 | Scan ảnh chụp tài liệu thành PDF; dàn lại Word/PDF về khổ A4 |

## Ba cách dùng

1. **Trang web**: mở địa chỉ GitHub Pages của dự án.
2. **Cài như ứng dụng (PWA)**: trên Chrome/Edge bấm "Cài ứng dụng"; trên iPhone, iPad mở bằng Safari, chọn Chia sẻ → "Thêm vào MH chính". Sau lần mở đầu tiên, giao diện và công cụ PDF, Word dùng được khi mất mạng. Vào **Cài đặt → Tải gói ngoại tuyến** để tải trước bộ nhận dạng chữ và bộ xử lý ảnh scan (OpenCV).
3. **Bản một tệp HTML** (khoảng 24 MB): tải tại **Cài đặt → Tải bản một tệp HTML**, mở thẳng bằng trình duyệt. Mọi thành phần nằm sẵn trong tệp; chính sách bảo mật (CSP) chặn mọi kết nối ra ngoài. Bản này không có trợ lý AI.

## Trợ lý AI (tuỳ chọn)

Mặc định tắt. Người dùng tự bật trong Cài đặt và nhập khoá API Claude của chính mình (lấy tại console.anthropic.com, tính phí theo tài khoản đó). Khoá chỉ lưu trong trình duyệt. Nội dung chỉ được gửi tới Anthropic mỗi lần bấm nút AI và xác nhận. Không dùng AI cho tài liệu mật hoặc có thông tin cá nhân.

## Phát triển

Cần Node.js 20 trở lên.

```bash
npm install
npm run dev            # chạy thử tại http://localhost:5173
npm run build          # bản web/PWA → dist/
npm run build:single   # bản một tệp → dist-single/index.html
npm run build:all      # cả hai
```

Mỗi lần đẩy lên nhánh `main`, GitHub Actions (`.github/workflows/pages.yml`) build và đăng lên GitHub Pages, kèm bản một tệp tại `download/BeaconDesk.html`. Lần đầu cần bật **Settings → Pages → Source: GitHub Actions** trong kho.

Cấu trúc chính:

- `src/main.js`: khung ứng dụng, thanh bên, định tuyến `#/công-cụ`.
- `src/tools/`: mỗi công cụ một tệp, chỉ tải khi mở.
- `src/core/`: phần dùng chung (PDF, OCR, Word, PowerPoint, NĐ30, chính tả, lưu trữ trên máy, PWA).
- `src/sw-template.js`, `scripts/gen-sw.mjs`: service worker cho chế độ ngoại tuyến.
- `legacy/`: bản 2.5 cũ để đối chiếu.

## Lưu ý

- Kết quả nhận dạng chữ, tóm tắt, kiểm tra chính tả là công cụ hỗ trợ; hãy đọc lại trước khi dùng chính thức.
- Phần kiểm tra thể thức đối chiếu các quy định chính của Nghị định 30/2020/NĐ-CP, không thay thế việc rà soát của người có thẩm quyền.
- Chữ ký, con dấu chèn vào PDF là hình ảnh, không phải chữ ký số.

## Thư viện sử dụng

pdf-lib (MIT), PDF.js (Apache-2.0), Tesseract.js (Apache-2.0), docx (MIT), mammoth (BSD-2-Clause), JSZip (MIT), heic2any (MIT), OpenCV.js (Apache-2.0), Anthropic SDK (MIT), phông DejaVu.
