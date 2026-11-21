// AI tuỳ chọn (chỉ bản online): người dùng tự bật trong Cài đặt và dùng khoá API Claude của chính mình.
// Khoá chỉ lưu trên thiết bị. Mỗi lần gửi đều hỏi xác nhận, hiển thị lượng chữ sẽ gửi đi.
import { kvGet, kvSet } from './store.js';

export const AI_MODEL = 'claude-opus-5-5';

export async function aiSettings() {
  return { enabled: false, key: '', ...(await kvGet('ai', {})) };
}
export const saveAiSettings = (s) => kvSet('ai', s);

/** AI có dùng được ngay lúc này không (đã bật, có khoá, có mạng, không phải bản một tệp). */
export async function aiReady() {
  if (__SINGLE__ || !navigator.onLine) return false;
  const s = await aiSettings();
  return !!(s.enabled && s.key);
}

/** Gửi một yêu cầu văn bản tới Claude. Trả về chuỗi trả lời. */
export async function askClaude(system, text, { maxTokens = 16000 } = {}) {
  const s = await aiSettings();
  if (!s.enabled || !s.key) throw new Error('Chưa bật AI. Vào Cài đặt để bật và nhập khoá API.');
  const ok = confirm(`Gửi khoảng ${text.length.toLocaleString('vi-VN')} ký tự nội dung tới Claude (Anthropic) để xử lý?\n\nNội dung sẽ rời khỏi thiết bị này. Không gửi tài liệu mật.`);
  if (!ok) throw new Error('Đã huỷ, không gửi gì đi.');
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: s.key, dangerouslyAllowBrowser: true });
  let res;
  try {
    res = await client.beta.messages.create({
      model: AI_MODEL,
      max_tokens: maxTokens,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system,
      messages: [{ role: 'user', content: text }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error('Khoá API không hợp lệ. Kiểm tra lại trong Cài đặt.');
    if (e instanceof Anthropic.RateLimitError) throw new Error('Đang vượt giới hạn gọi API, hãy thử lại sau ít phút.');
    if (e instanceof Anthropic.APIConnectionError) throw new Error('Không kết nối được tới máy chủ AI. Kiểm tra mạng.');
    if (e instanceof Anthropic.APIError) throw new Error(`Lỗi từ máy chủ AI (${e.status}): ${e.message}`);
    throw e;
  }
  if (res.stop_reason === 'refusal') throw new Error('AI từ chối xử lý nội dung này.');
  return res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
}
