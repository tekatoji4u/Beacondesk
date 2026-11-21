// Chỉ dùng cho bản một tệp HTML: nhúng toàn bộ tài nguyên vào trong tệp.
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?raw';
import fontRegular from '../../public/fonts/DejaVuSerif.ttf?inline';
import fontBold from '../../public/fonts/DejaVuSerif-Bold.ttf?inline';
import fontItalic from '../../public/fonts/DejaVuSerif-Italic.ttf?inline';
import ocrWorker from '../../public/ocr/worker.min.js?raw';
import ocrCore from '../../public/ocr/tesseract-core-lstm.wasm.js?raw';
import ocrLang from '../../public/ocr/vie.traineddata.gz?inline';

const urls = new Map();
const fromText = (t, type) => URL.createObjectURL(new Blob([t], { type }));
function fromDataUrl(d) {
  const b64 = d.slice(d.indexOf(',') + 1);
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([u]));
}

export function blobUrl(key) {
  if (urls.has(key)) return urls.get(key);
  let u;
  switch (key) {
    case 'pdfWorker': u = fromText(pdfWorker, 'text/javascript'); break;
    case 'fontRegular': u = fromDataUrl(fontRegular); break;
    case 'fontBold': u = fromDataUrl(fontBold); break;
    case 'fontItalic': u = fromDataUrl(fontItalic); break;
    // Worker OCR đọc dữ liệu tiếng Việt qua fetch(langPath/vie.traineddata.gz):
    // chuyển yêu cầu đó sang blob: đã nhúng sẵn.
    case 'ocrWorker': u = fromText(`self.__bdLang=${JSON.stringify(blobUrl('ocrLang'))};const __bdF=self.fetch.bind(self);self.fetch=(r,o)=>/vie\\.traineddata/.test(String(r))?__bdF(self.__bdLang):__bdF(r,o);\n` + ocrWorker, 'text/javascript'); break;
    // hậu tố "#.js" để tesseract.js coi đây là đường dẫn tệp core cụ thể
    case 'ocrCore': u = fromText(ocrCore, 'text/javascript') + '#core.js'; break;
    case 'ocrLang': u = fromDataUrl(ocrLang); break;
    default: throw new Error('Thiếu tài nguyên: ' + key);
  }
  urls.set(key, u);
  return u;
}
