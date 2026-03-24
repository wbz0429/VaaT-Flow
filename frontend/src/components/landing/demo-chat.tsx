"use client";

import { Loader2, Check, FileSpreadsheet, FileText, BarChart3 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useState, useEffect, useRef, useCallback } from "react";

import { demoScenariosById } from "@/core/demo/scenarios";
import type { DemoPreviewMessage } from "@/core/demo/types";

// --- Data types ---

export type DemoScenario = DemoPreviewMessage[];

// --- Scenarios ---

export const scenarios: Record<string, DemoScenario> = {
  ops: demoScenariosById.ops.tasks[0]!.preview,
  dev: demoScenariosById.dev.tasks[0]!.preview,
  mgmt: demoScenariosById.mgmt.tasks[0]!.preview,
};

// --- Sub-components ---

const artifactIcons: Record<string, React.ReactNode> = {
  ppt: <FileSpreadsheet className="h-4 w-4" />,
  code: <FileText className="h-4 w-4" />,
  chart: <BarChart3 className="h-4 w-4" />,
  report: <FileText className="h-4 w-4" />,
};

function ToolCallBadge({
  name,
  animating,
}: {
  name: string;
  animating: boolean;
}) {
  return (
    <span className="mb-1 inline-flex items-center gap-1.5 rounded-md bg-white/5 px-2 py-0.5 text-xs text-zinc-400">
      {animating ? (
        <Loader2 className="h-3 w-3 animate-spin text-zinc-500" />
      ) : (
        <Check className="h-3 w-3 text-green-500" />
      )}
      调用工具: {name}
    </span>
  );
}

function ArtifactCard({ type, label }: { type: string; label: string }) {
  return (
    <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-zinc-700/50 bg-gradient-to-r from-zinc-800/80 to-zinc-800/40 px-3 py-2 text-sm text-zinc-200">
      <span className="text-blue-400">{artifactIcons[type] ?? <FileText className="h-4 w-4" />}</span>
      {label}
    </div>
  );
}

// --- Typing text hook ---

function useTypingText(fullText: string, active: boolean, speed = 30) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!active) {
      setDisplayed("");
      setDone(false);
      return;
    }
    let i = 0;
    setDisplayed("");
    setDone(false);
    const iv = setInterval(() => {
      i++;
      if (i >= fullText.length) {
        setDisplayed(fullText);
        setDone(true);
        clearInterval(iv);
      } else {
        setDisplayed(fullText.slice(0, i));
      }
    }, speed);
    return () => clearInterval(iv);
  }, [fullText, active, speed]);

  return { displayed, done };
}

// --- Message component ---

function ChatMessage({
  msg,
  onTypingDone,
}: {
  msg: DemoPreviewMessage;
  onTypingDone?: () => void;
}) {
  const isUser = msg.role === "user";
  const [toolDone, setToolDone] = useState(!msg.toolCall);
  const { displayed, done: typingDone } = useTypingText(
    msg.content,
    true,
    isUser ? 40 : 25,
  );

  // Tool call: show spinner for 600ms then check
  useEffect(() => {
    if (!msg.toolCall) return;
    const t = setTimeout(() => setToolDone(true), 600);
    return () => clearTimeout(t);
  }, [msg.toolCall]);

  // Notify parent when fully rendered
  const notified = useRef(false);
  useEffect(() => {
    if (typingDone && toolDone && !notified.current) {
      notified.current = true;
      onTypingDone?.();
    }
  }, [typingDone, toolDone, onTypingDone]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-blue-600/80 text-white"
            : "bg-zinc-800/80 text-zinc-200"
        }`}
      >
        {msg.toolCall && (
          <div className="mb-1">
            <ToolCallBadge name={msg.toolCall.name} animating={!toolDone} />
          </div>
        )}
        <span className="whitespace-pre-wrap">{displayed}</span>
        {!typingDone && (
          <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-current align-middle" />
        )}
        {msg.artifact && typingDone && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25 }}
          >
            <ArtifactCard type={msg.artifact.type} label={msg.artifact.label} />
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

// --- Main DemoChat component ---

export default function DemoChat({ scenario }: { scenario: DemoScenario }) {
  const [visibleCount, setVisibleCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  // Reset and start playback when scenario changes
  useEffect(() => {
    clearTimers();
    setVisibleCount(0);

    // Show first message after its delay
    const t = setTimeout(() => setVisibleCount(1), scenario[0]?.delay ?? 600);
    timersRef.current.push(t);

    return clearTimers;
  }, [scenario, clearTimers]);

  // Schedule next message when current one finishes typing
  const handleTypingDone = useCallback(
    (index: number) => {
      const next = index + 1;
      if (next >= scenario.length) return;
      const t = setTimeout(
        () => setVisibleCount((c) => Math.max(c, next + 1)),
        scenario[next]!.delay,
      );
      timersRef.current.push(t);
    },
    [scenario],
  );

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [visibleCount]);

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50">
      {/* Title bar */}
      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
        <span className="text-sm font-medium text-zinc-300">
          Allo · 元枢
        </span>
      </div>

      {/* Chat area */}
      <div
        ref={scrollRef}
        className="flex h-[360px] flex-col gap-3 overflow-y-auto px-4 py-4"
      >
        <AnimatePresence mode="sync">
          {scenario.slice(0, visibleCount).map((msg, i) => (
            <ChatMessage
              key={`${scenario === scenarios.ops ? "ops" : scenario === scenarios.dev ? "dev" : "mgmt"}-${i}`}
              msg={msg}
              onTypingDone={() => handleTypingDone(i)}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
