# Worklog

---
Task ID: 1
Agent: main
Task: Self-host Qwen3.8-27B-Uncensored via Google Colab + Cloudflare Tunnel

Work Log:
- Created Google Colab notebook (Qween_Colab_Setup.ipynb) with 10 cells
- Notebook handles: deps install, repo clone, MLX→GGUF conversion, llama.cpp build, cloudflared tunnel, server start, URL display, test
- Wired src/app/api/agent/chat/route.ts with SELF_HOSTED_BASE_URL support (streaming)
- Wired src/app/api/agent/run/route.ts with SELF_HOSTED_BASE_URL support (agent runs)
- Updated .env.example with self-hosted config documentation
- Updated settings-tab.tsx to show self-hosted model info and setup guide
- Committed and pushed to GitHub (2988fa4..4febe37)

Stage Summary:
- All 4 tasks complete: notebook created, JARVIS wired, .env updated, pushed to GitHub
- Notebook at: download/Qween_Colab_Setup.ipynb
- When SELF_HOSTED_BASE_URL is set, JARVIS bypasses OpenRouter entirely and uses the self-hosted llama.cpp endpoint
- User needs to: open Colab, run notebook, copy URL, set as env var in Vercel