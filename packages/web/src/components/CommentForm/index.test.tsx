import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CommentForm } from '.';

describe('CommentForm', () => {
  it('does not submit while a Room is joining', () => {
    const onSubmit = vi.fn();
    render(<CommentForm disabled onSubmit={onSubmit} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.submit(input.closest('form')!);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
