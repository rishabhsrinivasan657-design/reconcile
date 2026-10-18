'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Empty, ErrorState, SkeletonRows } from '@/components/States';
import { api, unwrap } from '@/lib/api';
import { when } from '@/lib/format';
import { docTypeWords } from '@/lib/words';

/** Documents the AI wasn't sure about, so a person checks only those fields (US-05). */
export default function ReviewPage() {
  const router = useRouter();
  const q = useQuery({
    queryKey: ['documents', 'review'],
    queryFn: () => unwrap(api.GET('/review')),
  });
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Only the documents and fields the AI wasn’t sure about</p>
          <h1>Review</h1>
        </div>
      </div>
      <div className="panel">
        {q.isPending ? (
          <SkeletonRows label="Loading documents to review" />
        ) : q.isError ? (
          <ErrorState error={q.error} retry={() => q.refetch()} />
        ) : q.data.length === 0 ? (
          <Empty
            title="Nothing to review"
            action={
              <Link className="btn" href="/problems">
                Go to problems
              </Link>
            }
          >
            Every document was read confidently, or has already been checked.
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="ledger">
              <thead>
                <tr>
                  <th scope="col">Document</th>
                  <th scope="col">Vendor</th>
                  <th scope="col">Why it needs a look</th>
                  <th scope="col" className="right">
                    Unsure fields
                  </th>
                  <th scope="col">Uploaded</th>
                </tr>
              </thead>
              <tbody>
                {q.data.map((r) => (
                  <tr
                    key={r.document.id}
                    className="clickable"
                    onClick={() => router.push(`/documents/${r.document.id}`)}
                  >
                    <td>
                      <span className="muted tiny">{docTypeWords(r.document.type)}</span>
                      <div>
                        <Link
                          className="mono"
                          href={`/documents/${r.document.id}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {r.document.docNumber ?? 'Unreadable number'}
                        </Link>
                      </div>
                    </td>
                    <td>{r.vendorName ?? <span className="faint">Unknown</span>}</td>
                    <td>
                      {r.reasons[0] ?? 'Flagged for a look'}
                      {r.reasons.length > 1 && (
                        <span className="faint"> · and {r.reasons.length - 1} more</span>
                      )}
                    </td>
                    <td className="right">{r.unsureFields}</td>
                    <td className="faint">{when(r.document.uploadedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
