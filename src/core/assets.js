// Đường dẫn tới tài nguyên nặng (worker pdf.js, phông chữ, OCR).
// Bản web: tệp riêng cùng nguồn, được service worker lưu lại.
// Bản một tệp: nhúng sẵn trong HTML và chuyển thành blob: URL khi cần.
const cache = new Map();

export function getAsset(key) {
  if (!cache.has(key)) cache.set(key, __SINGLE__ ? singleAsset(key) : webAsset(key));
  return cache.get(key);
}

async function webAsset(key) {
  const base = document.baseURI;
  switch (key) {
    case 'pdfWorker': return (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    case 'fontRegular': return new URL('fonts/DejaVuSerif.ttf', base).href;
    case 'fontBold': return new URL('fonts/DejaVuSerif-Bold.ttf', base).href;
    case 'fontItalic': return new URL('fonts/DejaVuSerif-Italic.ttf', base).href;
    case 'ocrWorker': return new URL('ocr/worker.min.js', base).href;
    case 'ocrCoreDir': return new URL('ocr/', base).href;
    case 'ocrLang': return new URL('ocr/vie.traineddata.gz', base).href;
    default: throw new Error('Thiếu tài nguyên: ' + key);
  }
}

async function singleAsset(key) {
  const m = await import('./assets-single.js');
  return m.blobUrl(key);
}
