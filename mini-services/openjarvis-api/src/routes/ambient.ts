/**
 * Phase 13 — Ambient Presence Routes
 */
import { Router, Request, Response, NextFunction } from 'express';
import { wakeWordService } from '../services/wakeWordService.js';
import { ambientVoiceService } from '../services/ambientVoiceService.js';
import { proactiveSpeechService } from '../services/proactiveSpeechService.js';
import { avatarService } from '../services/avatarService.js';

const router = Router();

// ---- Wake Word ----

/** GET /ambient/wakeword — get wake word config */
router.get('/wakeword', async (_req, res, next) => {
  try { res.json(await wakeWordService.getConfig()); } catch (err) { next(err); }
});

/** PUT /ambient/wakeword — update wake word config */
router.put('/wakeword', async (req, res, next) => {
  try { res.json(await wakeWordService.updateConfig(req.body)); } catch (err) { next(err); }
});

/** GET /ambient/wakeword/headers — get required COOP/COEP headers */
router.get('/wakeword/headers', async (_req, res) => {
  res.json(wakeWordService.getRequiredHeaders());
});

// ---- Ambient Voice ----

/** POST /ambient/voice/sessions — create ambient voice session */
router.post('/voice/sessions', async (req, res, next) => {
  try { res.status(201).json(await ambientVoiceService.createSession(req.body)); } catch (err) { next(err); }
});

/** GET /ambient/voice/sessions — list sessions */
router.get('/voice/sessions', async (_req, res, next) => {
  try { res.json(await ambientVoiceService.listSessions()); } catch (err) { next(err); }
});

/** GET /ambient/voice/sessions/:id — get session */
router.get('/voice/sessions/:id', async (req, res, next) => {
  try {
    const session = await ambientVoiceService.getSession(req.params.id);
    if (!session) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Session not found' } }); return; }
    res.json(session);
  } catch (err) { next(err); }
});

/** POST /ambient/voice/sessions/:id/status — update session status */
router.post('/voice/sessions/:id/status', async (req, res, next) => {
  try {
    const { status, ...extra } = req.body;
    res.json(await ambientVoiceService.updateStatus(req.params.id, status, extra));
  } catch (err) { next(err); }
});

/** POST /ambient/voice/sessions/:id/silence — record silence (for idle re-arm check) */
router.post('/voice/sessions/:id/silence', async (req, res, next) => {
  try {
    const { silenceMs } = req.body;
    const result = await ambientVoiceService.recordSilence(req.params.id, silenceMs || 0);
    res.json(result);
  } catch (err) { next(err); }
});

/** POST /ambient/voice/sessions/:id/end — end session */
router.post('/voice/sessions/:id/end', async (req, res, next) => {
  try { res.json(await ambientVoiceService.endSession(req.params.id)); } catch (err) { next(err); }
});

// ---- Proactive Speech ----

/** GET /ambient/proactive — get proactive speech config */
router.get('/proactive', async (_req, res, next) => {
  try { res.json(await proactiveSpeechService.getConfig()); } catch (err) { next(err); }
});

/** PUT /ambient/proactive — update proactive speech config */
router.put('/proactive', async (req, res, next) => {
  try {
    const updated = await proactiveSpeechService.updateConfig(req.body);
    await proactiveSpeechService.reinit();
    res.json(updated);
  } catch (err) { next(err); }
});

// ---- Avatar ----

/** GET /ambient/avatar — get avatar config */
router.get('/avatar', async (_req, res, next) => {
  try { res.json(await avatarService.getConfig()); } catch (err) { next(err); }
});

/** PUT /ambient/avatar — update avatar config */
router.put('/avatar', async (req, res, next) => {
  try { res.json(await avatarService.updateConfig(req.body)); } catch (err) { next(err); }
});

/** POST /ambient/avatar/session — create HeyGen avatar session */
router.post('/avatar/session', async (req, res, next) => {
  try { res.json(await avatarService.createHeyGenSession()); } catch (err) { next(err); }
});

// ---- Preference Proposals ----

/** GET /ambient/preferences — list preference proposals */
router.get('/preferences', async (req, res, next) => {
  try {
    const { status, capability } = req.query;
    const proposals = await (await import('../services/preferenceProposalService.js')).preferenceProposalService.listProposals({
      status: status as string,
      capability: capability as string,
    });
    res.json(proposals);
  } catch (err) { next(err); }
});

/** POST /ambient/preferences/:id/accept — accept a preference proposal */
router.post('/preferences/:id/accept', async (req, res, next) => {
  try {
    const result = await (await import('../services/preferenceProposalService.js')).preferenceProposalService.acceptProposal(req.params.id);
    res.json(result);
  } catch (err) { next(err); }
});

/** POST /ambient/preferences/:id/dismiss — dismiss a preference proposal */
router.post('/preferences/:id/dismiss', async (req, res, next) => {
  try {
    const result = await (await import('../services/preferenceProposalService.js')).preferenceProposalService.dismissProposal(req.params.id);
    res.json(result);
  } catch (err) { next(err); }
});

export default router;
