// Adapted from the user-supplied React Bits ThoughtLine component.
import { useEffect, useState } from 'react';
import { Check, ChevronDown, Sparkles } from 'lucide-react';
import './ThoughtLine.css';

export default function ThoughtLine({
  working,
  steps,
  label = '正在整理菜谱…',
  doneLabel = '整理完成，用时',
}: {
  working: boolean;
  steps: string[];
  label?: string;
  doneLabel?: string;
}) {
  const [seconds, setSeconds] = useState(0);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    setOpen(working);
    if (!working) return;
    const start = performance.now();
    setSeconds(0);
    const timer = window.setInterval(() => setSeconds((performance.now() - start) / 1000), 100);
    return () => window.clearInterval(timer);
  }, [working]);
  return (
    <div
      className="thought-line"
      data-working={working ? '' : undefined}
      data-open={open ? '' : undefined}
    >
      <button
        type="button"
        className="thought-line__head"
        data-toggle=""
        aria-expanded={open}
        aria-label={working ? label : doneLabel}
        onClick={() => setOpen(!open)}
      >
        <span className="thought-line__glyph" aria-hidden="true">
          <Sparkles />
        </span>
        <span className="thought-line__label" aria-hidden="true">
          <span className="thought-line__text" data-active={working ? '' : undefined}>
            <span className="thought-line__breath" data-shimmer="">
              {label}
            </span>
          </span>
          <span
            className="thought-line__text thought-line__text--done"
            data-active={working ? undefined : ''}
          >
            {doneLabel}
          </span>
        </span>
        <span className="thought-line__timer" aria-hidden="true">
          {seconds.toFixed(1)}s
        </span>
        <span className="thought-line__chevron" data-on="" aria-hidden="true">
          <ChevronDown size="1em" />
        </span>
      </button>
      <span className="thought-line__sr" role="status">
        {working ? label : doneLabel}
      </span>
      <div className="thought-line__trace" data-open={open ? '' : undefined} aria-hidden={!open}>
        <div className="thought-line__fold">
          <div className="thought-line__steps">
            {steps.map((text, i) => (
              <div
                key={text}
                className="thought-line__step"
                data-done={!working || i < steps.length - 1 ? '' : undefined}
              >
                <span className="thought-line__mark" aria-hidden="true">
                  {!working || i < steps.length - 1 ? (
                    <Check size="1em" />
                  ) : (
                    <i className="thought-line__pulse" />
                  )}
                </span>
                <span className="thought-line__step-text">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
