'use client';
import { useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  exportUserData,
  importUserData,
  parseUserData,
  serializeUserData,
} from '../persistence/database';
import { useApp } from '../state/AppContext';

export function PadTools() {
  const {
    kit,
    presets,
    selectedPadIndex,
    selectedPreset,
    updatePad,
    movePad,
    assignPreset,
    saveKit,
    resetKit,
  } = useApp();
  const [editing, setEditing] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const downloadData = async () => {
    const blob = new Blob([serializeUserData(await exportUserData())], {
      type: 'application/json',
    });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `pulse-foundry-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  };
  const importData = async (file?: File) => {
    if (!file) return;
    await importUserData(parseUserData(await file.text()));
    window.location.reload();
  };

  return (
    <div className="pad-tools">
      <button onClick={() => setEditing(true)}>Pad settings</button>
      <button onClick={() => setLibraryOpen(true)}>Kit & backup</button>
      {editing && (
        <Dialog open={editing} onOpenChange={setEditing}>
          <DialogContent
            className="bottom-panel"
            showCloseButton={false}
            aria-describedby={undefined}
            data-gesture-lock
          >
            <div className="panel-handle" />
            <header>
              <div>
                <span>PAD {selectedPadIndex + 1}</span>
                <DialogTitle>{selectedPreset.name}</DialogTitle>
              </div>
              <button
                onClick={() => setEditing(false)}
                aria-label="Close pad editor"
              >
                <X />
              </button>
            </header>
            <label className="field-row">
              <span>Label</span>
              <input
                value={kit.pads[selectedPadIndex].label}
                onChange={(event) =>
                  updatePad(selectedPadIndex, {
                    label: event.target.value.toUpperCase().slice(0, 14),
                  })
                }
              />
            </label>
            <label className="field-row">
              <span>Sound</span>
              <NativeSelect
                value={kit.pads[selectedPadIndex].presetId}
                onChange={(event) => assignPreset(event.target.value)}
              >
                {presets.map((preset) => (
                  <NativeSelectOption key={preset.id} value={preset.id}>
                    {preset.category} · {preset.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
            <Parameter
              label="Volume"
              value={kit.pads[selectedPadIndex].volume}
              min={0}
              max={1}
              step={0.01}
              onChange={(value) =>
                updatePad(selectedPadIndex, { volume: value })
              }
            />
            <Parameter
              label="Pan"
              value={kit.pads[selectedPadIndex].pan}
              min={-1}
              max={1}
              step={0.01}
              onChange={(value) => updatePad(selectedPadIndex, { pan: value })}
            />
            <Parameter
              label="Tune"
              value={kit.pads[selectedPadIndex].tune}
              min={-24}
              max={24}
              step={1}
              suffix=" st"
              onChange={(value) => updatePad(selectedPadIndex, { tune: value })}
            />
            <div className="panel-actions">
              <button
                onClick={() => movePad(selectedPadIndex, -1)}
                disabled={selectedPadIndex === 0}
              >
                <ChevronLeft /> Move
              </button>
              <label className="mute-switch">
                {kit.pads[selectedPadIndex].muted ? <VolumeX /> : <Volume2 />}{' '}
                Mute{' '}
                <Switch
                  aria-label="Mute pad"
                  checked={kit.pads[selectedPadIndex].muted}
                  onCheckedChange={(checked) =>
                    updatePad(selectedPadIndex, { muted: checked })
                  }
                />
              </label>
              <button
                onClick={() => movePad(selectedPadIndex, 1)}
                disabled={selectedPadIndex === 15}
              >
                Move <ChevronRight />
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {libraryOpen && (
        <Dialog open={libraryOpen} onOpenChange={setLibraryOpen}>
          <DialogContent
            className="bottom-panel compact-panel"
            showCloseButton={false}
            aria-describedby={undefined}
            data-gesture-lock
          >
            <header>
              <div>
                <span>KIT & DATA</span>
                <DialogTitle>{kit.name}</DialogTitle>
              </div>
              <button
                onClick={() => setLibraryOpen(false)}
                aria-label="Close kit and data tools"
              >
                <X />
              </button>
            </header>
            <div className="large-action-grid">
              <button onClick={saveKit}>Save custom kit</button>
              <button onClick={resetKit}>Reset factory kit</button>
              <button onClick={downloadData}>
                <Download /> Export JSON
              </button>
              <button onClick={() => importRef.current?.click()}>
                <Upload /> Import JSON
              </button>
            </div>
            <input
              ref={importRef}
              hidden
              type="file"
              accept="application/json"
              onChange={(event) => void importData(event.target.files?.[0])}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function Parameter({
  label,
  value,
  min,
  max,
  step,
  suffix = '',
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="parameter-row">
      <span>{label}</span>
      <Slider
        aria-label={label}
        aria-valuetext={`${value}${suffix}`}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(next) =>
          onChange(typeof next === 'number' ? next : next[0])
        }
      />
      <output>
        {Number(value).toFixed(step < 1 ? 2 : 0)}
        {suffix}
      </output>
    </label>
  );
}
