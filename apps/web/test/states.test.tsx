import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Empty, ErrorState, SkeletonRows } from '../src/components/States';

describe('loading, empty, and error states (M5 AC-10)', () => {
  it('loading shows shaped placeholders with a label for screen readers', () => {
    render(<SkeletonRows rows={3} label="Loading problems" />);
    expect(screen.getByRole('status', { name: 'Loading problems' })).toBeTruthy();
  });
  it('empty states invite the next step', () => {
    render(
      <Empty title="No open problems" action={<a href="/upload">Upload documents</a>}>
        Everything is matched.
      </Empty>,
    );
    expect(screen.getByRole('heading', { name: 'No open problems' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Upload documents' })).toBeTruthy();
  });
  it('errors say what happened and offer to try again', () => {
    const retry = vi.fn();
    render(<ErrorState error={new Error("Couldn't reach the server.")} retry={retry} />);
    expect(screen.getByRole('alert').textContent).toContain("Couldn't reach the server.");
    screen.getByRole('button', { name: /Try again/ }).click();
    expect(retry).toHaveBeenCalledOnce();
  });
});
