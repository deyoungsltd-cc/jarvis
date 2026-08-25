'use client';

import { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Loader2, ImageIcon, Video, Mic, Download, AlertCircle, RefreshCw, Play, Square, Volume2,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type GenProvider = 'openrouter' | 'minimax';

type VideoTask = {
  taskId: string;
  status: 'processing' | 'completed' | 'failed';
  url?: string;
  error?: string;
};

export function MediaTab() {
  // ─── Image State ────────────────────────────────
  const [imgPrompt, setImgPrompt] = useState('');
  const [imgModel, setImgModel] = useState('black-forest-labs/flux-1.1-pro');
  const [imgLoading, setImgLoading] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);
  const [imgResult, setImgResult] = useState<{ url?: string; content?: string } | null>(null);

  // ─── Video State ────────────────────────────────
  const [vidPrompt, setVidPrompt] = useState('');
  const [vidLoading, setVidLoading] = useState(false);
  const [vidError, setVidError] = useState<string | null>(null);
  const [vidTask, setVidTask] = useState<VideoTask | null>(null);
  const vidPollRef = useRef<NodeJS.Timeout | null>(null);

  // ─── Voice State ────────────────────────────────
  const [voiceText, setVoiceText] = useState('');
  const [voiceId, setVoiceId] = useState('pNInz6obpgDQGcFmaJgB');
  const [voiceProvider, setVoiceProvider] = useState<'elevenlabs' | 'minimax'>('elevenlabs');
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceAudio, setVoiceAudio] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // ─── Image Generation ───────────────────────────
  const generateImage = useCallback(async () => {
    if (!imgPrompt.trim()) return;
    setImgLoading(true);
    setImgError(null);
    setImgResult(null);
    try {
      const res = await fetch('/api/generate/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: imgPrompt, model: imgModel }),
      });
      const data = await res.json();
      if (!res.ok) { setImgError(data.error || 'Image generation failed'); return; }
      setImgResult(data);
    } catch { setImgError('Network error'); }
    finally { setImgLoading(false); }
  }, [imgPrompt, imgModel]);

  // ─── Video Generation ───────────────────────────
  const generateVideo = useCallback(async () => {
    if (!vidPrompt.trim()) return;
    setVidLoading(true);
    setVidError(null);
    setVidTask(null);
    if (vidPollRef.current) clearInterval(vidPollRef.current);
    try {
      const res = await fetch('/api/generate/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: vidPrompt }),
      });
      const data = await res.json();
      if (!res.ok) { setVidError(data.error || 'Video generation failed'); setVidLoading(false); return; }

      const task: VideoTask = { taskId: data.taskId, status: 'processing' };
      setVidTask(task);

      // Poll for completion
      vidPollRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/generate/video?taskId=${data.taskId}`);
          const pollData = await pollRes.json();
          setVidTask({ ...task, ...pollData });
          if (pollData.status === 'completed' || pollData.status === 'failed') {
            if (vidPollRef.current) clearInterval(vidPollRef.current);
            setVidLoading(false);
          }
        } catch { /* continue polling */ }
      }, 5000);
    } catch { setVidError('Network error'); setVidLoading(false); }
  }, [vidPrompt]);

  // ─── Voice Generation ───────────────────────────
  const generateVoice = useCallback(async () => {
    if (!voiceText.trim()) return;
    setVoiceLoading(true);
    setVoiceError(null);
    setVoiceAudio(null);
    try {
      const res = await fetch('/api/generate/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: voiceText, voiceId, provider: voiceProvider }),
      });
      const data = await res.json();
      if (!res.ok) { setVoiceError(data.error || 'Voice generation failed'); return; }
      setVoiceAudio(data.audio);
    } catch { setVoiceError('Network error'); }
    finally { setVoiceLoading(false); }
  }, [voiceText, voiceId, voiceProvider]);

  return (
    <div className="flex flex-col h-full gap-3">
      <Tabs defaultValue="image" className="w-full">
        <TabsList className="h-9 w-full">
          <TabsTrigger value="image" className="flex-1 gap-1 text-xs"><ImageIcon className="h-3.5 w-3.5" /> Image</TabsTrigger>
          <TabsTrigger value="video" className="flex-1 gap-1 text-xs"><Video className="h-3.5 w-3.5" /> Video</TabsTrigger>
          <TabsTrigger value="voice" className="flex-1 gap-1 text-xs"><Mic className="h-3.5 w-3.5" /> Voice</TabsTrigger>
        </TabsList>

        {/* ─── IMAGE TAB ────────────────────────────── */}
        <TabsContent value="image" className="mt-3 space-y-3">
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={imgPrompt}
                onChange={(e) => setImgPrompt(e.target.value)}
                placeholder="Describe the image you want..."
                className="flex-1 h-9 text-sm"
                onKeyDown={(e) => e.key === 'Enter' && generateImage()}
                disabled={imgLoading}
              />
              <Select value={imgModel} onValueChange={setImgModel}>
                <SelectTrigger className="w-[200px] h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="black-forest-labs/flux-1.1-pro">Flux 1.1 Pro</SelectItem>
                  <SelectItem value="black-forest-labs/flux-1.1-pro-ultra">Flux 1.1 Pro Ultra</SelectItem>
                  <SelectItem value="stabilityai/stable-diffusion-xl-9
74-768px-v1-0">SDXL 1.0</SelectItem>
                  <SelectItem value="google/gemma-3-27b-it">Gemma 3 (describes image)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={generateImage} disabled={imgLoading || !imgPrompt.trim()} className="w-full h-9 gap-2">
              {imgLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
              Generate Image
            </Button>
          </div>
          {imgError && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" /><span>{imgError}</span>
            </div>
          )}
          {imgResult?.url && (
            <div className="rounded-lg overflow-hidden border border-border">
              <img src={imgResult.url} alt={imgPrompt} className="w-full h-auto max-h-[400px] object-contain bg-muted" />
              <div className="p-2 flex items-center justify-between">
                <span className="text-xs text-muted-foreground truncate flex-1">{imgPrompt}</span>
                <a href={imgResult.url} download target="_blank" rel="noreferrer">
                  <Button variant="ghost" size="sm" className="h-7 gap-1"><Download className="h-3 w-3" />Save</Button>
                </a>
              </div>
            </div>
          )}
          {imgResult?.content && !imgResult?.url && (
            <Card className="border-border/50"><CardContent className="p-3 text-sm whitespace-pre-wrap">{imgResult.content}</CardContent></Card>
          )}
        </TabsContent>

        {/* ─── VIDEO TAB ────────────────────────────── */}
        <TabsContent value="video" className="mt-3 space-y-3">
          <div className="space-y-2">
            <Textarea
              value={vidPrompt}
              onChange={(e) => setVidPrompt(e.target.value)}
              placeholder="Describe the video you want to generate..."
              className="min-h-[80px] text-sm"
              disabled={vidLoading}
            />
            <Button onClick={generateVideo} disabled={vidLoading || !vidPrompt.trim()} className="w-full h-9 gap-2">
              {vidLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
              Generate Video
            </Button>
          </div>
          {vidError && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" /><span>{vidError}</span>
            </div>
          )}
          {vidTask && (
            <Card className="border-border/50">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Video Generation</span>
                  <Badge variant={vidTask.status === 'completed' ? 'default' : vidTask.status === 'failed' ? 'destructive' : 'secondary'} className="text-[10px]">
                    {vidTask.status}
                  </Badge>
                </div>
                {vidTask.status === 'processing' && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Generating... this can take 1-5 minutes</span>
                  </div>
                )}
                {vidTask.url && (
                  <video src={vidTask.url} controls className="w-full rounded-lg max-h-[300px]" />
                )}
                {vidTask.error && (
                  <p className="text-xs text-destructive">{vidTask.error}</p>
                )}
              </CardContent>
            </Card>
          )}
          <p className="text-[10px] text-muted-foreground">Requires MINIMAX_API_KEY. Video generation takes 1-5 minutes.</p>
        </TabsContent>

        {/* ─── VOICE TAB ────────────────────────────── */}
        <TabsContent value="voice" className="mt-3 space-y-3">
          <div className="space-y-2">
            <Textarea
              value={voiceText}
              onChange={(e) => setVoiceText(e.target.value)}
              placeholder="Enter text to convert to speech..."
              className="min-h-[60px] text-sm"
              disabled={voiceLoading}
            />
            <div className="flex gap-2">
              <Select value={voiceProvider} onValueChange={(v) => setVoiceProvider(v as 'elevenlabs' | 'minimax')}>
                <SelectTrigger className="h-9 text-xs w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="elevenlabs">ElevenLabs</SelectItem>
                  <SelectItem value="minimax">MiniMax</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={generateVoice} disabled={voiceLoading || !voiceText.trim()} className="flex-1 h-9 gap-2">
                {voiceLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
                Generate Voice
              </Button>
            </div>
          </div>
          {voiceError && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" /><span>{voiceError}</span>
            </div>
          )}
          {voiceAudio && (
            <Card className="border-border/50">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Generated Audio</span>
                  <a href={voiceAudio} download="voice.mp3">
                    <Button variant="ghost" size="sm" className="h-7 gap-1"><Download className="h-3 w-3" />Download</Button>
                  </a>
                </div>
                <audio ref={audioRef} src={voiceAudio} controls className="w-full" />
              </CardContent>
            </Card>
          )}
          <p className="text-[10px] text-muted-foreground">
            {voiceProvider === 'elevenlabs' ? 'Requires ELEVENLABS_API_KEY. Supports voice cloning.' : 'Requires MINIMAX_API_KEY.'}
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
