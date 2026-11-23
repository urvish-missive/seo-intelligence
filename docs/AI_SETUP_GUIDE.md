# Missive SEO Intelligence Platform — AI Assistant Setup Guide

## Phase 8: Local AI Assistant with Ollama & Qwen

This guide outlines how to configure, verify, and maintain the local AI assistant in the Missive Digital SEO Intelligence Platform.

---

## 1. Architecture & Privacy Principles

The AI assistant runs **100% locally** using Ollama and the Qwen family of reasoning models.

- **Zero Cloud AI Leakage:** No client data, credentials, analytics metrics, or SEO findings are ever transmitted to OpenAI, Anthropic, Google Gemini, or any external third-party cloud.
- **Strict Read-Only Advisory:** The assistant functions as an analytical diagnostic partner. It cannot mutate site settings, DNS records, or database configurations.
- **Credential Stripping:** All prompts pass through `aiGuardrailService` to ensure API keys, database hashes, and tokens are scrubbed before inference.

---

## 2. Hardware Recommendations

| Model | Parameters | Minimum RAM | Recommended GPU / VRAM | Use Case |
|---|---|---|---|---|
| **qwen2.5:7b** *(Default)* | 8 Billion | 16 GB RAM | 6-8 GB VRAM (RTX 3060+) | Fast, high-accuracy SEO consultation |
| **qwen2.5:7b** | 7 Billion | 12 GB RAM | 6 GB VRAM | Lightweight / laptop usage |
| **qwen2.5:14b** | 14 Billion | 24 GB RAM | 10-12 GB VRAM (RTX 3080+) | Complex multi-domain audits |
| **qwen2.5:32b** | 32 Billion | 32 GB RAM | 16-24 GB VRAM (RTX 3090/4090) | Deep enterprise analysis |

---

## 3. Installation Guide

### Windows
1. Download the Windows installer from [ollama.com/download/windows](https://ollama.com/download/windows).
2. Run the installer `OllamaSetup.exe`.
3. Open PowerShell or Windows Terminal and start the service:
   ```powershell
   ollama serve
   ```
4. Pull the recommended SEO model:
   ```powershell
   ollama pull qwen2.5:7b
   ```

### macOS
1. Download from [ollama.com/download/mac](https://ollama.com/download/mac) or install via Homebrew:
   ```bash
   brew install ollama
   ollama serve
   ollama pull qwen2.5:7b
   ```

### Linux / Docker
```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama serve
ollama pull qwen2.5:7b
```

---

## 4. Verification

Verify that Ollama is responding on `localhost:11434`:

```bash
# Check installed models
curl http://127.0.0.1:11434/api/tags
```

Expected JSON response:
```json
{
  "models": [
    {
      "name": "qwen2.5:7b",
      "model": "qwen2.5:7b",
      "size": 5200000000
    }
  ]
}
```

---

## 5. Platform Configuration

The platform backend connects to Ollama using environment variables in `backend/.env`:

```env
# Local Ollama AI Engine
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:7b
OLLAMA_TIMEOUT_MS=120000
OLLAMA_MAX_CONTEXT_TOKENS=8000
```

### Workspace Customization
Workspace administrators can customize the active model, temperature, and context length directly in the UI under **AI Assistant** or via API `PUT /api/v1/workspaces/:workspaceId/ai/config`.

---

## 6. Troubleshooting

### 1. "Ollama is not reachable at http://127.0.0.1:11434"
- Ensure Ollama is running (`ollama serve`).
- Verify firewall allows local communication on port `11434`.

### 2. "Model 'qwen2.5:7b' not found in local Ollama"
- Run `ollama pull qwen2.5:7b` from your terminal.
- Refresh the UI page; the indicator pill will turn green.

### 3. Out of Memory (OOM) / CUDA Error
- If your GPU lacks VRAM, Ollama will automatically fall back to CPU inference.
- To reduce memory footprint, switch to `qwen2.5:7b` in workspace settings.
