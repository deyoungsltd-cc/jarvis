import { useCallback, useState, useEffect } from 'react';
import { soundEffects } from '@/lib/sounds';

/**
 * useSounds Hook
 *
 * Exposes the JARVIS sound effects API to React components.
 * Includes a reactive `soundsEnabled` state that updates
 * when sounds are toggled.
 */
export function useSounds() {
  const [soundsEnabled, setSoundsEnabled] = useState(() => {
    if (typeof window === 'undefined') return true;
    return soundEffects.isSoundsEnabled();
  });

  // Sync state on mount and when localStorage changes
  useEffect(() => {
    const handleStorage = () => {
      setSoundsEnabled(soundEffects.isSoundsEnabled());
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const toggleSounds = useCallback(() => {
    const next = soundEffects.toggleSounds();
    setSoundsEnabled(next);
    return next;
  }, []);

  const playActivation = useCallback(() => soundEffects.playActivation(), []);
  const playSuccess = useCallback(() => soundEffects.playSuccess(), []);
  const playError = useCallback(() => soundEffects.playError(), []);
  const playNotification = useCallback(() => soundEffects.playNotification(), []);

  return {
    playActivation,
    playSuccess,
    playError,
    playNotification,
    soundsEnabled,
    toggleSounds,
  };
}
