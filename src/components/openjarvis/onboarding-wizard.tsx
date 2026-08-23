'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { checkHealth } from '@/lib/openjarvis-api';
import {
  Bot,
  Cloud,
  Server,
  Mic,
  MicOff,
  Check,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  ArrowRight,
  Loader2,
  Volume2,
  Eye,
} from 'lucide-react';

// ---- Types ----

type AIProvider = 'gemini' | 'groq' | 'local';
type TTSProvider = 'browser' | 'gemini' | 'groq';
type WizardStep = 0 | 1 | 2 | 3 | 4 | 5;

interface OnboardingPreferences {
  provider: AIProvider;
  apiKey: string;
  localLlmUrl: string;
  localLlmModel: string;
  ttsProvider: TTSProvider;
  onboarded: boolean;
  completedAt: string;
}

const STORAGE_KEY = 'jarvis_onboarded';
const PREFS_KEY = 'jarvis_preferences';

const TOTAL_STEPS = 6;

// ---- Helpers ----

function getPrefs(): OnboardingPreferences | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function savePrefs(prefs: Partial<OnboardingPreferences>): void {
  if (typeof window === 'undefined') return;
  const existing = getPrefs() || {};
  localStorage.setItem(PREFS_KEY, JSON.stringify({ ...existing, ...prefs }));
}

function isOnboarded(): boolean {
  if (typeof window === 'undefined') return true; // SSR safe
  return localStorage.getItem(STORAGE_KEY) === 'true';
}

function markOnboarded(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, 'true');
  savePrefs({ onboarded: true, completedAt: new Date().toISOString() });
}

// ---- Provider Cards Data ----

const PROVIDERS = [
  {
    id: 'gemini' as AIProvider,
    name: 'Google Gemini',
    icon: Cloud,
    description: 'Fast, capable, and free tier available. Supports voice natively.',
    model: 'gemini-2.5-flash',
    badge: 'Recommended',
    badgeVariant: 'default' as const,
  },
  {
    id: 'groq' as AIProvider,
    name: 'Groq',
    icon: Sparkles,
    description: 'Ultra-fast inference with open-source models. Great for real-time use.',
    model: 'llama-3.3-70b-versatile',
    badge: 'Fast',
    badgeVariant: 'secondary' as const,
  },
  {
    id: 'local' as AIProvider,
    name: 'Local (Qwen3.8)',
    icon: Server,
    description: 'Run models locally via Ollama or LM Studio. Fully private, no API key needed.',
    model: 'qwen2.5:32b',
    badge: 'Private',
    badgeVariant: 'outline' as const,
  },
];

// ---- Main Component ----

export function OnboardingWizard() {
  const [step, setStep] = useState<WizardStep>(0);
  const [provider, setProvider] = useState<AIProvider>('gemini');
  const [apiKey, setApiKey] = useState('');
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [localLlmUrl, setLocalLlmUrl] = useState('http://localhost:11434');
  const [localLlmModel, setLocalLlmModel] = useState('qwen2.5:32b');
  const [ttsProvider, setTtsProvider] = useState<TTSProvider>('browser');
  const [micPermission, setMicPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [testMessage, setTestMessage] = useState('');
  const [llmDetected, setLlmDetected] = useState(false);
  const [checkingLlm, setCheckingLlm] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Load existing preferences
    const prefs = getPrefs();
    if (prefs) {
      if (prefs.provider) setProvider(prefs.provider);
      if (prefs.apiKey) setApiKey(prefs.apiKey);
      if (prefs.localLlmUrl) setLocalLlmUrl(prefs.localLlmUrl);
      if (prefs.localLlmModel) setLocalLlmModel(prefs.localLlmModel);
      if (prefs.ttsProvider) setTtsProvider(prefs.ttsProvider);
    }
    // Check mic permission
    if (typeof navigator !== 'undefined' && navigator.permissions) {
      navigator.permissions.query({ name: 'microphone' as PermissionName }).then((result) => {
        setMicPermission(result.state === 'granted' ? 'granted' : result.state === 'denied' ? 'denied' : 'unknown');
      }).catch(() => {
        // permissions API may not support microphone
        setMicPermission('unknown');
      });
    }
  }, []);

  // Check for local LLM when on that step
  useEffect(() => {
    if (step === 3) {
      checkLocalLlm();
    }
  }, [step]);

  const checkLocalLlm = async () => {
    setCheckingLlm(true);
    setLlmDetected(false);
    try {
      const res = await fetch(`${localLlmUrl}/v1/models`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        setLlmDetected(true);
      }
    } catch {
      setLlmDetected(false);
    } finally {
      setCheckingLlm(false);
    }
  };

  const testApiConnection = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    setTestMessage('');

    try {
      // Test the connection to the backend
      await checkHealth();
      setTestResult('success');
      setTestMessage('Backend is reachable.');
    } catch {
      setTestResult('error');
      setTestMessage('Could not reach backend API. Make sure it is running.');
    }
    setTesting(false);
  }, []);

  const testMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicPermission('granted');
    } catch {
      setMicPermission('denied');
    }
  };

  const handleNext = () => {
    const next = Math.min(step + 1, TOTAL_STEPS - 1) as WizardStep;
    setStep(next);
  };

  const handleBack = () => {
    const prev = Math.max(step - 1, 0) as WizardStep;
    setStep(prev);
  };

  const handleSkip = () => {
    // Save current state and mark as onboarded
    savePrefs({ provider, apiKey, localLlmUrl, localLlmModel, ttsProvider });
    markOnboarded();
  };

  const handleFinish = () => {
    savePrefs({ provider, apiKey, localLlmUrl, localLlmModel, ttsProvider });
    markOnboarded();
  };

  if (!mounted) {
    return null; // SSR guard
  }

  // ---- Step Renderers ----

  const renderStep0_Welcome = () => (
    <div className="flex flex-col items-center text-center gap-6 py-4">
      <div className="h-20 w-20 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
        <Bot className="h-10 w-10 text-emerald-500" />
      </div>
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Let's set up JARVIS</h2>
        <p className="text-muted-foreground mt-2 max-w-md">
          OpenJARVIS is your AI agent platform. Let's configure a few things
          to get you started. This will only take a minute.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5"><Cloud className="h-3.5 w-3.5" /> AI Provider</span>
        <span>·</span>
        <span className="flex items-center gap-1.5"><Mic className="h-3.5 w-3.5" /> Voice</span>
        <span>·</span>
        <span className="flex items-center gap-1.5"><Settings2Icon className="h-3.5 w-3.5" /> Preferences</span>
      </div>
    </div>
  );

  const renderStep1_Provider = () => (
    <div className="flex flex-col gap-4">
      <div className="text-center mb-2">
        <h2 className="text-xl font-bold">Choose an AI Provider</h2>
        <p className="text-sm text-muted-foreground mt-1">
          This powers JARVIS's intelligence. You can change it later.
        </p>
      </div>
      <div className="grid gap-3">
        {PROVIDERS.map((p) => {
          const Icon = p.icon;
          const isSelected = provider === p.id;
          return (
            <Card
              key={p.id}
              className={`cursor-pointer transition-all hover:shadow-md ${
                isSelected
                  ? 'ring-2 ring-primary border-primary'
                  : 'hover:border-border'
              }`}
              onClick={() => setProvider(p.id)}
            >
              <CardContent className="flex items-start gap-4 py-4 px-5">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
                  isSelected ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                }`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{p.name}</span>
                    <Badge variant={p.badgeVariant} className="text-[10px]">{p.badge}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{p.description}</p>
                  <p className="text-[10px] text-muted-foreground mt-1.5 font-mono">
                    Default: {p.model}
                  </p>
                </div>
                <div className="shrink-0 mt-1">
                  {isSelected && <Check className="h-5 w-5 text-primary" />}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );

  const renderStep2_ApiKey = () => {
    if (provider === 'local') {
      // Skip API key step for local
      return renderStep3_LocalLlm();
    }

    const providerInfo = PROVIDERS.find((p) => p.id === provider);
    return (
      <div className="flex flex-col gap-5">
        <div className="text-center mb-2">
          <h2 className="text-xl font-bold">Enter your {providerInfo?.name} API Key</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Your key is stored locally in your browser and never sent to our servers.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <div className="relative">
            <Input
              type={apiKeyVisible ? 'text' : 'password'}
              placeholder={`${provider.toUpperCase()}_API_KEY`}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setApiKeyVisible(!apiKeyVisible)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Eye className="h-4 w-4" />
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={testApiConnection}
            disabled={testing}
          >
            {testing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {testing ? 'Testing...' : 'Test Connection'}
          </Button>

          {testResult && (
            <div
              className={`text-xs px-3 py-2 rounded-md ${
                testResult === 'success'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-destructive/10 text-destructive'
              }`}
            >
              {testMessage}
            </div>
          )}
        </div>

        <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3">
          <p className="font-medium mb-1">Where to get your key:</p>
          {provider === 'gemini' && (
            <p>Visit <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" className="underline">aistudio.google.com/apikey</a> — Free tier available with generous limits.</p>
          )}
          {provider === 'groq' && (
            <p>Visit <a href="https://console.groq.com/keys" target="_blank" rel="noopener" className="underline">console.groq.com/keys</a> — Free tier with fast inference.</p>
          )}
        </div>
      </div>
    );
  };

  const renderStep3_LocalLlm = () => (
    <div className="flex flex-col gap-5">
      <div className="text-center mb-2">
        <h2 className="text-xl font-bold">Local LLM Setup</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {provider === 'local'
            ? 'Configure your local model server for fully private AI.'
            : 'Optionally, you can also use a local LLM as a fallback.'}
        </p>
      </div>

      {provider === 'local' && (
        <div className="bg-muted/50 rounded-md p-4 text-sm space-y-2">
          <p className="font-medium">Install Ollama</p>
          <ol className="list-decimal list-inside space-y-1 text-muted-foreground text-xs">
            <li>
              Download Ollama from{' '}
              <a href="https://ollama.com" target="_blank" rel="noopener" className="underline">
                ollama.com
              </a>
            </li>
            <li>Install and restart your terminal</li>
            <li>
              Pull a model:{' '}
              <code className="bg-background px-1.5 py-0.5 rounded text-[11px] font-mono">
                ollama pull {localLlmModel}
              </code>
            </li>
            <li>Start the server: <code className="bg-background px-1.5 py-0.5 rounded text-[11px] font-mono">ollama serve</code></li>
          </ol>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Server URL
          </label>
          <Input
            value={localLlmUrl}
            onChange={(e) => setLocalLlmUrl(e.target.value)}
            placeholder="http://localhost:11434"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Model Name
          </label>
          <Input
            value={localLlmModel}
            onChange={(e) => setLocalLlmModel(e.target.value)}
            placeholder="qwen2.5:32b"
          />
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={checkLocalLlm}
          disabled={checkingLlm}
        >
          {checkingLlm && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {checkingLlm ? 'Checking...' : 'Detect Running Server'}
        </Button>

        {llmDetected && (
          <div className="text-xs px-3 py-2 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            Local LLM server detected at {localLlmUrl}!
          </div>
        )}
        {!llmDetected && !checkingLlm && step === 3 && provider === 'local' && (
          <div className="text-xs px-3 py-2 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
            No LLM server detected. Start Ollama or LM Studio first.
          </div>
        )}
      </div>
    </div>
  );

  const renderStep4_Voice = () => (
    <div className="flex flex-col gap-5">
      <div className="text-center mb-2">
        <h2 className="text-xl font-bold">Voice Setup</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Test your microphone and choose a text-to-speech provider.
        </p>
      </div>

      {/* Mic Test */}
      <Card>
        <CardContent className="py-4 px-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`h-9 w-9 rounded-lg flex items-center justify-center ${
                  micPermission === 'granted'
                    ? 'bg-emerald-500/10 text-emerald-500'
                    : micPermission === 'denied'
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {micPermission === 'granted' ? (
                  <Mic className="h-4.5 w-4.5" />
                ) : (
                  <MicOff className="h-4.5 w-4.5" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium">Microphone</p>
                <p className="text-xs text-muted-foreground">
                  {micPermission === 'granted'
                    ? 'Access granted'
                    : micPermission === 'denied'
                    ? 'Access denied — check browser permissions'
                    : 'Not tested yet'}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={testMic}>
              Test Mic
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* TTS Provider */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium">Text-to-Speech Provider</label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {(
            [
              { id: 'browser' as TTSProvider, name: 'Browser', desc: 'Built-in TTS' },
              { id: 'gemini' as TTSProvider, name: 'Gemini', desc: 'Google Cloud TTS' },
              { id: 'groq' as TTSProvider, name: 'Groq', desc: 'Groq TTS' },
            ] as const
          ).map((tts) => (
            <Card
              key={tts.id}
              className={`cursor-pointer transition-all hover:shadow-sm ${
                ttsProvider === tts.id
                  ? 'ring-2 ring-primary border-primary'
                  : ''
              }`}
              onClick={() => setTtsProvider(tts.id)}
            >
              <CardContent className="flex items-center gap-2 py-3 px-4">
                <Volume2 className={`h-4 w-4 shrink-0 ${ttsProvider === tts.id ? 'text-primary' : 'text-muted-foreground'}`} />
                <div className="min-w-0">
                  <p className="text-xs font-medium">{tts.name}</p>
                  <p className="text-[10px] text-muted-foreground">{tts.desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );

  const renderStep5_Done = () => (
    <div className="flex flex-col items-center text-center gap-6 py-4">
      <div className="h-20 w-20 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
        <Check className="h-10 w-10 text-emerald-500" />
      </div>
      <div>
        <h2 className="text-2xl font-bold tracking-tight">JARVIS is ready!</h2>
        <p className="text-muted-foreground mt-2 max-w-md">
          Your setup is complete. You can always change these settings later
          in the Settings tab.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
        <Badge variant={provider === 'local' ? 'outline' : 'default'}>
          {PROVIDERS.find((p) => p.id === provider)?.name}
        </Badge>
        <Badge variant="secondary">{ttsProvider} TTS</Badge>
        {micPermission === 'granted' && <Badge variant="outline">Mic OK</Badge>}
      </div>
      <Button onClick={handleFinish} size="lg" className="mt-2">
        Go to Dashboard
        <ArrowRight className="h-4 w-4 ml-1" />
      </Button>
    </div>
  );

  // ---- Step Router ----

  const renderStep = () => {
    switch (step) {
      case 0: return renderStep0_Welcome();
      case 1: return renderStep1_Provider();
      case 2: return renderStep2_ApiKey();
      case 3: return renderStep3_LocalLlm();
      case 4: return renderStep4_Voice();
      case 5: return renderStep5_Done();
      default: return null;
    }
  };

  const isLastStep = step === TOTAL_STEPS - 1;
  const isFirstStep = step === 0;

  // When provider is 'local', skip the API key step (step 2 → step 3)
  const effectiveStep = provider === 'local' && step >= 2 ? step : step;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <Card className="w-full max-w-lg shadow-xl border-border/50">
        <CardHeader className="pb-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-emerald-500" />
              <CardTitle className="text-base">Setup Wizard</CardTitle>
            </div>
            <span className="text-xs text-muted-foreground">
              Step {step + 1} of {TOTAL_STEPS}
            </span>
          </div>
          {/* Progress bar */}
          <div className="mt-3 h-1 w-full bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
            />
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          <div className="min-h-[280px] flex flex-col justify-between">
            <div>{renderStep()}</div>

            {/* Navigation */}
            {!isLastStep && (
              <div className="flex items-center justify-between mt-6 pt-4 border-t">
                <Button variant="ghost" size="sm" onClick={handleSkip}>
                  Skip setup
                </Button>
                <div className="flex items-center gap-2">
                  {!isFirstStep && (
                    <Button variant="outline" size="sm" onClick={handleBack}>
                      <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                      Back
                    </Button>
                  )}
                  <Button size="sm" onClick={handleNext}>
                    {isFirstStep ? 'Get Started' : 'Continue'}
                    <ChevronRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Export hook for use in pages ----

export function useOnboarding() {
  const [shouldShow, setShouldShow] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!isOnboarded()) {
      setShouldShow(true);
    }
  }, []);

  const completeOnboarding = () => {
    setShouldShow(false);
  };

  return { shouldShow: mounted && shouldShow, completeOnboarding };
}

// ---- Settings2 icon (not in lucide default import above) ----
function Settings2Icon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M20 7h-9" />
      <path d="M14 17H5" />
      <circle cx="17" cy="17" r="3" />
      <circle cx="7" cy="7" r="3" />
    </svg>
  );
}
