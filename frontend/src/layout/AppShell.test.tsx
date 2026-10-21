import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { preferenceApi } from '@/data/repository';
import { loadPreferences } from '@/data/http/preferences';
import { useDb } from '@/test/fake/local/store';
import { useClock } from '@/state/clock';
import { useDevSettings } from '@/state/devSettings';
import { useSession } from '@/state/session';
import { AppShell } from './AppShell';

beforeEach(() => {
  act(() => {
    useDevSettings.getState().set({ latency: false, offline: false, failNext: false });
    useClock.getState().setNow('2027-04-06T09:00');
    useDb.getState().reset();
    useSession.getState().signIn('usr-nur');
  });
});

const renderShell = () =>
  render(
    <MemoryRouter initialEntries={['/master/template']}>
      <AppShell>
        <p>Isi halaman</p>
      </AppShell>
    </MemoryRouter>,
  );

describe('Sidebar collapse', () => {
  it('collapses to icons, keeps menu names accessible, and remembers the choice', () => {
    const { container, unmount } = renderShell();
    const toggle = screen.getByRole('button', { name: 'Ciutkan menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(container.querySelector('.shell')).not.toHaveClass('shell--collapsed');

    fireEvent.click(toggle);
    expect(container.querySelector('.shell')).toHaveClass('shell--collapsed');
    const expand = screen.getByRole('button', { name: 'Luaskan menu' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    // Labels are visually hidden but still name the links; the tooltip shows the name.
    const link = screen.getByRole('link', { name: 'Template' });
    expect(link).toHaveAttribute('title', 'Template');
    expect(preferenceApi.get('usr-nur', 'sidebarCollapsed')).toBe(true);

    unmount();
    const again = renderShell();
    expect(again.container.querySelector('.shell')).toHaveClass('shell--collapsed');
    fireEvent.click(screen.getByRole('button', { name: 'Luaskan menu' }));
    expect(again.container.querySelector('.shell')).not.toHaveClass('shell--collapsed');
    expect(screen.getByRole('link', { name: 'Template' })).not.toHaveAttribute('title');
    expect(preferenceApi.get('usr-nur', 'sidebarCollapsed')).toBe(false);
  });

  it("follows the signed-in user's own choice when the persona changes", async () => {
    // Admin DKB collapsed the sidebar earlier (stored on the server).
    act(() => useSession.getState().signIn('usr-admin'));
    await act(() => loadPreferences('usr-admin'));
    await act(() => preferenceApi.set('usr-admin', 'sidebarCollapsed', true));
    act(() => useSession.getState().signIn('usr-andi'));
    await act(() => loadPreferences('usr-andi'));
    const { container } = renderShell();
    expect(container.querySelector('.shell')).not.toHaveClass('shell--collapsed');
    act(() => useSession.getState().signIn('usr-admin'));
    await act(() => loadPreferences('usr-admin'));
    expect(container.querySelector('.shell')).toHaveClass('shell--collapsed');
  });
});
