import type { HistoryEntry } from '@/lib/api';
import { dateTime } from '@/lib/format';
import s from './Timeline.module.css';

/**
 * A PO's history (M5 AC-6): grey dots for system steps, accent dots for human decisions with
 * the person's name and note. Oldest first, so it reads like a story.
 */
export function Timeline({ entries }: { entries: HistoryEntry[] }) {
  // "Started reading" is a step, not news: the "Read …" entry right after it says the same.
  const shown = entries.filter((e) => e.action !== 'document.reading');
  return (
    <ol className={s.timeline}>
      {shown.map((e) => (
        <li key={e.id} className={s.entry}>
          <span
            className={`${s.dot} ${e.actor.type === 'USER' ? s.human : ''}`}
            aria-hidden="true"
          />
          <div>
            <div>
              {e.actor.name && <b>{e.actor.name.replace(/\s*\(.*\)$/, '')}: </b>}
              {e.summary}
            </div>
            <div className="faint tiny">
              <time dateTime={e.at}>{dateTime(e.at)}</time>
            </div>
            {e.note && <q className={e.actor.type === 'USER' ? s.note : s.systemNote}>{e.note}</q>}
          </div>
        </li>
      ))}
    </ol>
  );
}
