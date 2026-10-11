import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import {
  Button,
  ConfirmDialog,
  DataTable,
  FinalizeOperatorButton,
  MarkerBadge,
  PredicateBadge,
  TextInput,
  Toaster,
  Toggle,
  toast,
  useToastStore,
} from '.';

describe('Button', () => {
  it('is busy and disabled while loading, showing the loading label', () => {
    render(<Button loading>Simpan</Button>);
    const button = screen.getByRole('button', { name: 'Menyimpan…' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('describes the locked finalising action with the Pejabat name', () => {
    render(<FinalizeOperatorButton label="Terbitkan Register" officialName="Andi Wirawan" />);
    const button = screen.getByRole('button', { name: 'Terbitkan Register' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription('Dilakukan oleh Andi Wirawan');
  });
});

describe('form controls', () => {
  it('links the error message to the input', () => {
    render(<TextInput label="Nomor surat" error="Nomor surat wajib diisi." />);
    const input = screen.getByLabelText('Nomor surat');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Nomor surat wajib diisi.');
  });

  it('toggles a switch', () => {
    function Harness() {
      const [on, setOn] = useState(false);
      return <Toggle label="Konfidensial" checked={on} onChange={setOn} />;
    }
    render(<Harness />);
    const sw = screen.getByRole('switch', { name: 'Konfidensial' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(sw);
    expect(sw).toHaveAttribute('aria-checked', 'true');
  });
});

describe('badges carry text, never colour alone', () => {
  it('renders predicate and marker labels', () => {
    render(
      <>
        <PredicateBadge predicate="cukup" />
        <MarkerBadge kind="nonaktif" label="Nonaktif sejak TW II" />
      </>,
    );
    expect(screen.getByText('Cukup Terkendali')).toBeInTheDocument();
    expect(screen.getByText('Nonaktif sejak TW II')).toBeInTheDocument();
  });
});

describe('DataTable', () => {
  const rows = [
    { id: 'a', name: 'Pemecahan kontrak' },
    { id: 'b', name: 'RAB Mark-Up' },
  ];
  const columns = [
    { key: 'name', header: 'Risiko', primary: true, render: (r: (typeof rows)[0]) => r.name },
  ];

  it('activates a row by click and by Enter', () => {
    const onRowClick = vi.fn();
    render(
      <DataTable
        caption="Risiko"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={onRowClick}
      />,
    );
    const [, first, second] = screen.getAllByRole('row');
    fireEvent.click(first!);
    fireEvent.keyDown(second!, { key: 'Enter' });
    expect(onRowClick).toHaveBeenNthCalledWith(1, rows[0]);
    expect(onRowClick).toHaveBeenNthCalledWith(2, rows[1]);
  });

  it('shows the empty slot when there are no rows', () => {
    render(
      <DataTable
        caption="Risiko"
        columns={columns}
        rows={[]}
        rowKey={(r) => r.id}
        empty="Belum ada risiko."
      />,
    );
    expect(screen.getByText('Belum ada risiko.')).toBeInTheDocument();
  });
});

describe('ConfirmDialog', () => {
  it('focuses "Batal" first for destructive actions and closes on Escape', () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        destructive
        title="Nonaktifkan risiko ini?"
        confirmLabel="Nonaktifkan Risiko"
        onConfirm={() => {}}
        onCancel={onCancel}
      >
        Riwayat tetap tersimpan.
      </ConfirmDialog>,
    );
    expect(
      screen.getByRole('alertdialog', { name: 'Nonaktifkan risiko ini?' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Batal' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('Toast', () => {
  beforeEach(() => useToastStore.setState({ toasts: [] }));

  it('shows a toast and dismisses it after 4 seconds', () => {
    vi.useFakeTimers();
    render(<Toaster />);
    act(() => toast.success('Penilaian dituntaskan', '8 risiko dituntaskan untuk TW I.'));
    expect(screen.getByText('Penilaian dituntaskan')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(4000));
    expect(screen.queryByText('Penilaian dituntaskan')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('keeps at most three toasts', () => {
    render(<Toaster />);
    act(() => {
      for (let i = 1; i <= 4; i++) toast.success(`Pesan ${i}`);
    });
    expect(screen.getAllByRole('status')).toHaveLength(3);
    expect(screen.queryByText('Pesan 1')).not.toBeInTheDocument();
  });
});
