#!/usr/bin/env python3
"""Generate the Colab notebook for Qwen 27B Uncensored + Cloudflare Tunnel.
Fixed: Q3_K_M quant (~12GB) fits T4, 4096 context, crash detection, no f-string bugs."""
import json

cell0_md = """# Qwen 27B Uncensored — Colab + Cloudflare Tunnel
### Free T4 GPU. No credit card. No port forwarding.

**Step 1:** Runtime > Change runtime type > **T4 GPU** > Save
**Step 2:** Runtime > **Run all**
**Step 3:** Copy `SELF_HOSTED_BASE_URL=...` from the last cell into your JARVIS `.env`

**Keep this Colab tab open** while using JARVIS.
If it disconnects, re-run **Cells 4 and 5**."""

cell1_code = """# Cell 1: Check GPU + Install everything
!nvidia-smi --query-gpu=name,memory.total --format=csv,noheader

!apt-get update -qq && apt-get install -y -qq git-lfs wget curl build-essential cmake git > /dev/null 2>&1
!pip install -q gguf mlx-lm > /dev/null 2>&1
!wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared

import torch
vram_gb = torch.cuda.get_device_properties(0).total_mem / 1e9
print(f"VRAM: {vram_gb:.1f} GB")
if vram_gb < 14:
    raise RuntimeError(f"Need 14GB+ VRAM but got {vram_gb:.1f}GB. Change runtime type to T4 GPU!")
print("Cell 1 done - GPU OK, all deps installed")"""

cell2_code = """# Cell 2: Clone model + Build llama.cpp
import os

REPO_DIR = '/content/Qwen3.8-27B-Uncensored-MLX'
LLAMA_DIR = '/content/llama.cpp'
BUILD_DIR = os.path.join(LLAMA_DIR, 'build')
SERVER_BIN = os.path.join(BUILD_DIR, 'bin', 'llama-server')

# Clone model repo (~14GB with git-lfs)
if os.path.exists(REPO_DIR):
    print('Model already cloned')
else:
    print('Cloning model (~14GB, may take a few min)...')
    !git lfs install
    !git clone https://github.com/onurburak9/Qwen3.8-27B-Uncensored-MLX.git $REPO_DIR

# Build llama.cpp with CUDA
if os.path.exists(SERVER_BIN):
    print('llama.cpp already built')
else:
    print('Building llama.cpp with CUDA (5-8 min)...')
    if not os.path.exists(LLAMA_DIR):
        !git clone https://github.com/ggerganov/llama.cpp.git $LLAMA_DIR
    !cmake -S $LLAMA_DIR -B $BUILD_DIR -DGGML_CUDA=ON -DLLAMA_CURL=ON -DCMAKE_BUILD_TYPE=Release > /content/cmake_log.txt 2>&1
    !cmake --build $BUILD_DIR -j$(nproc) --target llama-server > /content/build_log.txt 2>&1
    if not os.path.exists(SERVER_BIN):
        print('BUILD FAILED! Last 20 lines of build log:')
        !tail -20 /content/build_log.txt
        raise RuntimeError('llama.cpp build failed - see log above')
    print('llama.cpp built OK')

print('Cell 2 done - model cloned, llama.cpp ready')"""

cell3_code = """# Cell 3: Convert MLX -> HF -> GGUF (Q3_K_M, ~12GB, fits T4 16GB VRAM)
import os, sys, glob, json, shutil, subprocess, time

HF_DIR = '/content/qwen-hf'
GGUF_DIR = '/content/qwen-gguf'
GGUF_FILE = os.path.join(GGUF_DIR, 'qwen-27b-uncensored-Q3_K_M.gguf')
os.makedirs(GGUF_DIR, exist_ok=True)

if os.path.exists(GGUF_FILE) and os.path.getsize(GGUF_FILE) > 1e9:
    print(f'GGUF already exists: {os.path.getsize(GGUF_FILE)/1e9:.2f} GB')
else:
    # Step 1: MLX -> HuggingFace format
    if not os.path.exists(os.path.join(HF_DIR, 'config.json')):
        print('Converting MLX -> HuggingFace format (5-10 min)...')
        from mlx_lm import convert as mlx_convert
        mlx_convert.convert(hf_path=HF_DIR, mlx_path=REPO_DIR, quantize=False)
        print('MLX -> HF conversion done')
    else:
        print('HF format already exists')

    # Free ~14GB disk by deleting MLX repo (no longer needed)
    if os.path.exists(REPO_DIR):
        shutil.rmtree(REPO_DIR)
        print('Deleted MLX repo (freed ~14GB disk)')

    # Step 2: HF -> GGUF Q3_K_M (direct quantization, no F16 intermediate)
    print('Converting HF -> GGUF Q3_K_M (10-20 min)...')
    print('Progress output will appear below:')
    proc = subprocess.Popen(
        ['python3', os.path.join(LLAMA_DIR, 'convert_hf_to_gguf.py'),
         HF_DIR, '--outfile', GGUF_FILE, '--outtype', 'q3_k_m'],
        stdout=sys.stdout, stderr=sys.stderr, text=True
    )
    proc.wait()
    if proc.returncode != 0:
        raise RuntimeError('GGUF conversion failed! Check output above.')
    print(f'GGUF created: {os.path.getsize(GGUF_FILE)/1e9:.2f} GB')

    # Free ~54GB disk by deleting HF intermediate files
    shutil.rmtree(HF_DIR, ignore_errors=True)
    print('Deleted HF files (freed ~54GB disk)')

print(f'Model ready: {GGUF_FILE}')"""

cell4_code = """# Cell 4: Start llama.cpp server
import subprocess, time, urllib.request, urllib.error

PORT = 8080

# Kill any existing server process
subprocess.run(['pkill', '-f', 'llama-server'], capture_output=True)
time.sleep(1)

server_proc = subprocess.Popen(
    [SERVER_BIN, '-m', GGUF_FILE, '-c', '4096', '-ngl', '99',
     '--port', str(PORT), '--host', '0.0.0.0', '--parallel', '2',
     '--cont-batching', '-t', '2'],
    stdout=subprocess.PIPE, stderr=subprocess.STDOUT
)

print(f'Server PID={server_proc.pid} on port {PORT}')
print('Loading model into VRAM (1-3 min on T4)...')

# Check for early crash (e.g. out-of-memory)
time.sleep(10)
if server_proc.poll() is not None:
    print('SERVER CRASHED during startup!')
    output = server_proc.stdout.read().decode(errors='replace')
    print(output[-1500:])
    raise RuntimeError('Server crashed on startup - see error above')

# Poll /v1/models until server is ready
print('Server process alive, waiting for model to fully load...')
for i in range(180):  # up to 6 minutes
    try:
        urllib.request.urlopen(f'http://localhost:{PORT}/v1/models', timeout=2)
        print(f'Ready! Model loaded in ~{(i+1)*2}s')
        break
    except:
        if server_proc.poll() is not None:
            print('SERVER CRASHED while loading model!')
            output = server_proc.stdout.read().decode(errors='replace')
            print(output[-1500:])
            raise RuntimeError('Server crashed during model loading - see error above')
        time.sleep(2)
        if (i + 1) % 15 == 0:
            print(f'  still loading... ({(i+1)*2}s)')
else:
    raise RuntimeError('Server did not become ready after 6 min')

print('Cell 4 done - server is running')"""

cell5_code = """# Cell 5: Cloudflare tunnel + show URL + test
import re, threading, urllib.request, json, subprocess, time

tunnel_url = [None]

# Kill any existing tunnel
subprocess.run(['pkill', '-f', 'cloudflared'], capture_output=True)
time.sleep(1)

# Start Cloudflare quick tunnel (no account needed)
tunnel_proc = subprocess.Popen(
    ['/usr/local/bin/cloudflared', 'tunnel', '--url', f'http://localhost:{PORT}'],
    stdout=subprocess.PIPE, stderr=subprocess.STDOUT
)

def watch_tunnel():
    for raw in tunnel_proc.stdout:
        line = raw.decode(errors='replace')
        m = re.search(r'https://([a-z0-9-]+\.trycloudflare\.com)', line)
        if m:
            tunnel_url[0] = m.group(1)
            print('')
            print('TUNNEL: https://' + tunnel_url[0])
            break

threading.Thread(target=watch_tunnel, daemon=True).start()
print('Waiting for Cloudflare tunnel URL...')

for i in range(60):
    if tunnel_url[0]:
        break
    time.sleep(1)
    if (i + 1) % 10 == 0:
        print(f'  waiting for tunnel... ({i+1}s)')

if tunnel_url[0]:
    BASE = 'https://' + tunnel_url[0]
    print('')
    print('=' * 55)
    print('COPY THIS INTO YOUR JARVIS .env FILE:')
    print('SELF_HOSTED_BASE_URL=' + BASE)
    print('=' * 55)
else:
    BASE = f'http://localhost:{PORT}'
    print('')
    print('Tunnel URL not found after 60s.')
    print('Check cell output above for a trycloudflare.com URL.')
    print(f'Local fallback: {BASE}')

# Test the endpoint
print('')
print('Testing model response...')
try:
    payload = json.dumps({
        'model': 'qwen',
        'messages': [{'role': 'user', 'content': 'Say hello in 5 words'}],
        'max_tokens': 50,
        'stream': False
    }).encode()
    req = urllib.request.Request(
        BASE + '/v1/chat/completions',
        data=payload,
        headers={'Content-Type': 'application/json'}
    )
    resp = urllib.request.urlopen(req, timeout=120)
    data = json.loads(resp.read())
    msg = data['choices'][0]['message']['content']
    print('Response: ' + msg)
    print('')
    print('ALL WORKING! Keep this Colab open while using JARVIS.')
except Exception as e:
    print('Test error: ' + str(e))
    print('If model is still loading, wait 1-2 min and re-run this cell.')"""

cell6_md = """## Done!

**Keep this Colab tab open.** If it disconnects, re-run **Cells 4 and 5** only.

Quick tunnel URLs change every time you reconnect.
For a permanent URL, sign up at https://dash.cloudflare.com/"""


def make_code_cell(source):
    lines = source.rstrip('\n').split('\n')
    return {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [line + "\n" for line in lines]
    }

def make_md_cell(source):
    lines = source.rstrip('\n').split('\n')
    return {
        "cell_type": "markdown",
        "metadata": {},
        "source": [line + "\n" for line in lines]
    }

notebook = {
    "nbformat": 4,
    "nbformat_minor": 0,
    "metadata": {
        "colab": {"provenance": [], "gpuType": "T4"},
        "kernelspec": {"name": "python3", "display_name": "Python 3"},
        "language_info": {"name": "python"},
        "accelerator": "GPU"
    },
    "cells": [
        make_md_cell(cell0_md),
        make_code_cell(cell1_code),
        make_code_cell(cell2_code),
        make_code_cell(cell3_code),
        make_code_cell(cell4_code),
        make_code_cell(cell5_code),
        make_md_cell(cell6_md),
    ]
}

out_path = '/home/z/my-project/download/Qween_Colab_Setup.ipynb'
with open(out_path, 'w') as f:
    json.dump(notebook, f, indent=1, ensure_ascii=False)

print(f'Notebook written to {out_path}')
print(f'Cells: {len(notebook["cells"])}')
