'use client';

import { useState } from 'react';

import { CLOUD } from '@/lib/cloud/config';
import { useI18n } from '@/lib/i18n/locale';

import { SectionLabel } from '../ui/icon';

/**
 * How to use Work Optional from Claude: the local MCP extension (mcp/).
 * Only links and the site's PUBLIC sync key — nothing here talks to Claude
 * or anything else; the extension runs on the person's own computer.
 */

const MCPB_URL =
  'https://github.com/tianyi-zhang-02/accretia/releases/download/mcp-v0.8.1/work-optional.mcpb';
const CODE_URL = 'https://github.com/tianyi-zhang-02/accretia/tree/main/mcp#claude-code';

export default function ClaudeCard() {
  const { t } = useI18n();
  const C = t.claude;
  const [copied, setCopied] = useState(false);

  return (
    <section className="card">
      <SectionLabel icon="spark">{C.heading}</SectionLabel>
      <p className="text-muted mt-2 text-[13px]">{C.body}</p>
      <ol className="mt-3 flex flex-col gap-2 text-[13px]">
        {C.steps.map((step, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="text-accent nums font-medium">{i + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      {CLOUD ? (
        <div className="bg-surface-2 mt-3 rounded-[10px] p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium">{C.keyLabel}</span>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() =>
                void navigator.clipboard?.writeText(CLOUD!.anonKey).then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                })
              }
            >
              {copied ? C.copied : C.copy}
            </button>
          </div>
          <p className="text-muted mt-1 truncate font-mono text-[11px]">{CLOUD.anonKey}</p>
          <p className="text-muted mt-1 text-[11px]">{C.keyHint}</p>
        </div>
      ) : (
        <p className="text-muted mt-3 text-xs">{C.noSync}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <a className="btn btn-primary" href={MCPB_URL} rel="noopener noreferrer">
          {C.download}
        </a>
        <a
          className="text-muted text-xs underline-offset-2 hover:underline"
          href={CODE_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          {C.codeLink} ›
        </a>
      </div>
    </section>
  );
}
