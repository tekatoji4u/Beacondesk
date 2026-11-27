// Giới thiệu: cách hoạt động, quyền riêng tư, lưu ý, mã nguồn mở và thư viện sử dụng.
import { h } from '../core/ui.js';
import { icon } from '../core/icons.js';
import { guardLink } from '../core/guard.js';
import { VERSION, AUTHOR } from '../main.js';

const REPO = 'https://github.com/tekatoji4u/beacondesk';
const LIBS = [
  ['pdf-lib', 'MIT'], ['PDF.js (Mozilla)', 'Apache-2.0'], ['Tesseract.js', 'Apache-2.0'], ['docx', 'MIT'],
  ['mammoth', 'BSD-2-Clause'], ['OpenCV.js', 'Apache-2.0'], ['JSZip', 'MIT'], ['heic2any', 'MIT'], ['Phông DejaVu', 'Bitstream Vera / miễn phí'],
];
const li = (ic, title, text) => h('li', null, h('span', { html: icon(ic), style: 'display:contents' }), h('div', null, h('b', null, title), h('span', null, text)));

export function render() {
  return h('div', null,
    h('section', { class: 'card' },
      h('h2', null, `BeaconDesk ${VERSION}`),
      h('p', { class: 'credit', style: 'margin:-4px 0 8px' }, 'Powered by ', h('b', null, AUTHOR)),
      h('p', { class: 'sub' }, 'Bộ công cụ văn phòng chạy hoàn toàn trong trình duyệt: xử lý PDF, nhận dạng chữ tiếng Việt, soạn và kiểm tra văn bản hành chính theo Nghị định 30/2020/NĐ-CP, tạo PowerPoint, tóm tắt, chuẩn bị bản in A4. Miễn phí, mã nguồn mở.'),
      h('ul', { class: 'feat' },
        li('shield', 'Tài liệu không rời khỏi máy', 'Mọi xử lý diễn ra trên thiết bị. Không có máy chủ nhận tệp, không quảng cáo, không theo dõi.'),
        li('wifiOff', 'Chạy khi mất mạng', 'Bản cài đặt (PWA) lưu sẵn toàn bộ chức năng; bản một tệp HTML chặn hẳn mọi kết nối ra ngoài.'),
        li('sparkles', 'AI chỉ khi bạn muốn', 'Trợ lý AI mặc định tắt; khi bật, chỉ gửi nội dung sau khi bạn xác nhận, dùng khoá API của chính bạn.'))),
    h('section', { class: 'card' },
      h('h2', null, 'Lưu ý khi sử dụng'),
      h('ul', { class: 'plain' },
        h('li', null, 'Kết quả nhận dạng chữ, tóm tắt và kiểm tra chính tả là công cụ hỗ trợ; hãy đọc lại trước khi dùng chính thức.'),
        h('li', null, 'Phần kiểm tra thể thức đối chiếu các quy định chính của Nghị định 30/2020/NĐ-CP, không thay thế việc rà soát của người có thẩm quyền.'),
        h('li', null, 'Chữ ký, con dấu chèn vào PDF là hình ảnh, không phải chữ ký số. Chỉ dùng chữ ký, con dấu khi bạn có quyền sử dụng.'),
        h('li', null, 'Tệp PDF có mật khẩu cần được mở khoá trước khi xử lý.'))),
    h('section', { class: 'card' },
      h('h2', null, 'Góp ý và mã nguồn'),
      h('p', { class: 'sub' }, 'Báo lỗi hoặc đề xuất tính năng tại trang GitHub của dự án.'),
      h('div', { class: 'row' },
        h('a', { class: 'btn', href: REPO + '/issues', target: '_blank', rel: 'noopener' }, h('span', { html: icon('github'), style: 'display:contents' }), 'Gửi góp ý'),
        guardLink(h('a', { class: 'btn btn-ghost', href: REPO, target: '_blank', rel: 'noopener' }, 'Xem mã nguồn'))),
      h('h3', { style: 'margin:18px 0 6px;font-size:15px' }, 'Thư viện sử dụng'),
      h('div', { class: 'row', style: 'gap:6px' }, LIBS.map(([n, l]) => h('span', { class: 'tag info', style: 'font-weight:600' }, `${n} · ${l}`)))));
}
