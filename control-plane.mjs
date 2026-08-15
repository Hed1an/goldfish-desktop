// Control Plane —— 本地 LLM 统一中介 (127.0.0.1:8765)
// 对接 Ollama,为 dsh-bring-local-llm 提供 /api/llm/run、/api/llm/route、/api/vision/read
// 启动: node control-plane.mjs
import http from 'node:http';

const OLLAMA = 'http://127.0.0.1:11434';
const MODEL = 'qwen3.5:9b-q4_K_M';
const VISION_MODEL = 'qwen3.5:9b-q4_K_M'; // 若该模型支持视觉则用,否则 vision 走云端

async function ollamaChat({ prompt, system, temperature, max_tokens, json_schema, think }) {
  const body = { model: MODEL, messages: [], stream: false, options: {} };
  if (system) body.messages.push({ role: 'system', content: system });
  body.messages.push({ role: 'user', content: prompt });
  if (temperature != null) body.options.temperature = temperature;
  // 注意:qwen3.5:9b 设置 num_predict(max_tokens) 会导致 Ollama 返回空 content —— 不传 num_predict,用默认自然输出
  const resp = await fetch(OLLAMA + '/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error('ollama HTTP ' + resp.status);
  const data = await resp.json();
  let text = data.message?.content || '';
  if (json_schema) { try { text = JSON.stringify(JSON.parse(text)); } catch {} }
  return { text, input_tokens: data.prompt_eval_count || 0, output_tokens: data.eval_count || 0, model: MODEL };
}

async function ollamaVision({ image, prompt }) {
  const body = { model: VISION_MODEL, prompt: prompt || '读取图片,提取 OCR/布局/对象', images: [image], stream: false };
  const resp = await fetch(OLLAMA + '/api/generate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error('ollama vision HTTP ' + resp.status);
  const data = await resp.json();
  return data.response || '';
}

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', async () => {
    res.setHeader('Content-Type', 'application/json');
    if (req.method !== 'POST' && req.url !== '/') {
      res.writeHead(405); res.end(JSON.stringify({ ok: false, error: 'method not allowed' })); return;
    }
    if (req.method !== 'POST') { res.end(JSON.stringify({ ok: true, service: 'control-plane', model: MODEL })); return; }
    let j = {};
    try { j = JSON.parse(body || '{}'); } catch { res.end(JSON.stringify({ ok: false, error: 'bad json' })); return; }
    try {
      if (req.url === '/api/llm/run') {
        try {
          const r = await ollamaChat(j);
          res.end(JSON.stringify({ ok: true, text: r.text, input_tokens: r.input_tokens, output_tokens: r.output_tokens, meta: { model: r.model } }));
        } catch (e) { res.end(JSON.stringify({ ok: false, text: '', summary: '本地 LLM 调用失败: ' + e.message, needs_cloud: true })); }
      } else if (req.url === '/api/llm/route') {
        try {
          const r = await ollamaChat(j);
          res.end(JSON.stringify({ ok: true, text: r.text, used_local: true, needs_cloud: false, attempts: [{ role: 'executor', status: 'ok', model: r.model }], input_tokens: r.input_tokens, output_tokens: r.output_tokens, meta: { model: r.model } }));
        } catch (e) { res.end(JSON.stringify({ ok: false, text: '', needs_cloud: true, used_local: false, attempts: [{ role: 'executor', status: 'failed' }], summary: '本地不可用: ' + e.message })); }
      } else if (req.url === '/api/vision/read') {
        try {
          const text = await ollamaVision({ image: j.image || j.path, prompt: j.prompt });
          res.end(JSON.stringify({ ok: true, summary: text, meta: {} }));
        } catch (e) { res.end(JSON.stringify({ ok: false, text: '', summary: '本地视觉不可用: ' + e.message, needs_cloud: true })); }
      } else {
        res.end(JSON.stringify({ ok: false, error: 'unknown route: ' + req.url }));
      }
    } catch (e) { res.end(JSON.stringify({ ok: false, error: e.message })); }
  });
});

server.listen(8765, '127.0.0.1', () => console.log('[control-plane] 127.0.0.1:8765 · model ' + MODEL));
