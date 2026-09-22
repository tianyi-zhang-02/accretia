'use client';

import { useEffect, useState } from 'react';

import { useI18n } from '@/lib/i18n/locale';

import { SectionLabel } from '../ui/icon';

/**
 * "Install this app" — the PWA route to a home-screen icon, no store needed.
 *
 * Three cases, decided in the browser:
 *   - already running as an installed app → a quiet "installed" line;
 *   - Chrome / Edge / Android fired `beforeinstallprompt` → one button;
 *   - iPhone / iPad Safari (never prompts) → the two taps, spelled out.
 * Nothing is stored; the card simply reflects how the page was opened.
 */

type Prompt = Event & { prompt: () => Promise<void> };

export function useInstallState() {
  const [standalone, setStandalone] = useState(false);
  const [ios, setIos] = useState(false);
  const [prompt, setPrompt] = useState<Prompt | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(display-mode: standalone)');
    const nav = navigator as Navigator & { standalone?: boolean };
    // One reader for everything the environment tells us; re-run on change.
    const update = () => {
      setStandalone(mq.matches || nav.standalone === true);
      setIos(
        /iPhone|iPad|iPod/.test(navigator.userAgent) && !/CriOS|FxiOS/.test(navigator.userAgent),
      );
    };
    update();
    mq.addEventListener('change', update);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as Prompt);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', update);
    return () => {
      mq.removeEventListener('change', update);
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', update);
    };
  }, []);

  return { standalone, ios, prompt, clearPrompt: () => setPrompt(null) };
}

export default function InstallCard({ state }: { state: ReturnType<typeof useInstallState> }) {
  const { t } = useI18n();
  const I = t.install;
  const { standalone, ios, prompt, clearPrompt } = state;

  return (
    <section className="card">
      <SectionLabel icon="house">{I.heading}</SectionLabel>
      {standalone ? (
        <p className="text-positive mt-2 text-[13px]">✓ {I.installed}</p>
      ) : (
        <>
          <p className="text-muted mt-2 text-[13px]">{I.body}</p>
          {prompt ? (
            <button
              type="button"
              className="btn btn-primary mt-3"
              onClick={() => void prompt.prompt().finally(clearPrompt)}
            >
              {I.installBtn}
            </button>
          ) : ios ? (
            <ol className="mt-3 flex flex-col gap-2 text-[13px]">
              {I.iosSteps.map((step, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="nums text-accent font-medium">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-muted mt-3 text-xs">{I.otherBrowser}</p>
          )}
        </>
      )}
    </section>
  );
}
