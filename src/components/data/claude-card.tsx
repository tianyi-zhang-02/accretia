'use client';

import { useState } from 'react';

import { CLOUD } from '@/lib/cloud/config';
import { useI18n } from '@/lib/i18n/locale';

import { SectionLabel } from '../ui/icon';

/**
 * How to use Work Optional from an AI assistant: the local MCP server
 * (mcp/). Claude Desktop installs the .mcpb; Claude Code and Codex run the
 * same server from the release's single file through the Keychain launcher.
 * Only links, commands and the site's PUBLIC sync key — nothing here talks
 * to any assistant; the server runs on the person's own computer.
 */

const RELEASE = 'https://github.com/tianyi-zhang-02/accretia/releases/download/mcp-v1.0.0';
const MCPB_URL = `${RELEASE}/work-optional.mcpb`;
const GUIDE_URL = 'https://github.com/tianyi-zhang-02/accretia/tree/main/mcp#readme';

type Client = 'desktop' | 'claudeCode' | 'codex';

/** The terminal setup for Claude Code / Codex on macOS. */
function commands(client: 'claudeCode' | 'codex', key: string | null) {
  const add =
    client === 'codex'
      ? `codex mcp add work-optional${key ? ` --env WORK_OPTIONAL_SYNC_KEY=${key}` : ''}`
      : `claude mcp add work-optional${key ? ` -e WORK_OPTIONAL_SYNC_KEY=${key}` : ''}`;
  return [
    'mkdir -p ~/.work-optional-mcp && cd ~/.work-optional-mcp',
    `curl -fsSL -O ${RELEASE}/work-optional-mcp.mjs -O ${RELEASE}/work-optional-mcp.sh && chmod +x work-optional-mcp.sh`,
    'security add-generic-password -a "$USER" -s work-optional -w',
    `${add} -- ~/.work-optional-mcp/work-optional-mcp.sh`,
  ].join('\n');
}

export default function ClaudeCard() {
  const { t } = useI18n();
  const C = t.claude;
  const [client, setClient] = useState<Client>('desktop');
  const [copied, setCopied] = useState<'key' | 'cmd' | null>(null);
  const copy = (text: string, what: 'key' | 'cmd') =>
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(what);
      window.setTimeout(() => setCopied(null), 1500);
    });
  const name = C.clients[client];

  return (
    <section className="card">
      <SectionLabel icon="spark">{C.heading}</SectionLabel>
      <p className="text-muted mt-2 text-[13px]">{C.body}</p>

      <div
        role="group"
        aria-label={C.heading}
        className="bg-surface-2 mt-3 flex overflow-hidden rounded-[10px]"
      >
        {(['desktop', 'claudeCode', 'codex'] as const).map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={client === c}
            onClick={() => setClient(c)}
            className={`min-h-9 flex-1 px-2 text-xs font-medium transition-colors ${
              client === c ? 'bg-foreground text-background' : 'text-muted hover:text-foreground'
            }`}
          >
            {C.clients[c]}
          </button>
        ))}
      </div>

      {client === 'desktop' ? (
        <>
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
                  onClick={() => copy(CLOUD!.anonKey, 'key')}
                >
                  {copied === 'key' ? C.copied : C.copy}
                </button>
              </div>
              <p className="text-muted mt-1 truncate font-mono text-[11px]">{CLOUD.anonKey}</p>
              <p className="text-muted mt-1 text-[11px]">{C.keyHint}</p>
            </div>
          ) : (
            <p className="text-muted mt-3 text-xs">{C.noSync}</p>
          )}
          <div className="mt-3">
            <a className="btn btn-primary" href={MCPB_URL} rel="noopener noreferrer">
              {C.download}
            </a>
          </div>
        </>
      ) : (
        <>
          <ol className="mt-3 flex flex-col gap-2 text-[13px]">
            {C.cliSteps(name).map((step, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="text-accent nums font-medium">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <div className="bg-surface-2 mt-3 rounded-[10px] p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium">{C.terminal}</span>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => copy(commands(client, CLOUD?.anonKey ?? null), 'cmd')}
              >
                {copied === 'cmd' ? C.copied : C.copy}
              </button>
            </div>
            <pre className="text-muted mt-2 overflow-x-auto font-mono text-[11px] leading-relaxed whitespace-pre">
              {commands(client, CLOUD ? '<key>' : null)}
            </pre>
            <p className="text-muted mt-2 text-[11px]">
              {CLOUD ? C.cliKeyNote : C.noSync} {C.cliPassNote}
            </p>
          </div>
        </>
      )}

      <a
        className="text-muted mt-3 inline-block text-xs underline-offset-2 hover:underline"
        href={GUIDE_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        {C.guide} ›
      </a>
    </section>
  );
}
