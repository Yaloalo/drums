'use client';

import { useRef, useState } from 'react';
import { Copy, Play, RotateCcw, Save, Sparkles } from 'lucide-react';
import type {
  ModulationDestination,
  ModulationSource,
  SynthPreset,
  VoiceArchitecture,
} from '../model/types';
import { cloneSerializable } from '../model/types';
import { engineSummary } from '../model/voice';
import { useApp } from '../state/AppContext';
import { PadTools } from './PadTools';
import { SearchMenu, type MenuOption } from './SearchMenu';
import { Chips, ModAssignProvider, Panel } from './SynthControls';
import { EngineEditor } from './SynthEngines';
import { SynthFlow, type ModuleId } from './SynthFlow';
import { ModStrip } from './SynthModulation';
import {
  AmpEditor,
  CombineEditor,
  EffectsEditor,
  FiltersEditor,
} from './SynthModules';

type View = 'synth' | 'library';

/** Searchable preset list: the user's sounds first, then factory categories. */
export function presetMenuOptions(presets: SynthPreset[]): MenuOption[] {
  return [...presets]
    .sort(
      (a, b) =>
        Number(a.factory) - Number(b.factory) ||
        (a.factory ? a.category.localeCompare(b.category) : 0) ||
        a.name.localeCompare(b.name),
    )
    .map((preset) => ({
      value: preset.id,
      label: preset.name,
      detail: preset.tags.join(' · '),
      group: preset.factory ? preset.category : 'My sounds',
      badge: engineSummary(preset),
      keywords: preset.category,
    }));
}

export function SynthScreen() {
  const {
    kit,
    selectedPadIndex,
    selectedPreset,
    presets,
    triggerPad,
    assignPreset,
    updateSelectedPreset,
    resetSelectedPreset,
    saveSelectedPreset,
    duplicateSelectedPreset,
    switchSlotEngine,
    selectPad,
  } = useApp();
  const [view, setView] = useState<View>('synth');
  const [activeModule, setActiveModule] = useState<ModuleId>('engine1');
  const [armed, setArmed] = useState<ModulationSource | null>(null);
  const editor = useRef<HTMLDivElement>(null);
  const pad = kit.pads[selectedPadIndex];

  const updatePreset = (mutator: (preset: SynthPreset) => void) => {
    const next = cloneSerializable(selectedPreset);
    mutator(next);
    updateSelectedPreset(next);
  };
  const updateVoice = (mutator: (voice: VoiceArchitecture) => void) =>
    updatePreset((next) => mutator(next.voice));
  const setAmount = (destination: ModulationDestination, amount: number) => {
    if (!armed) return;
    updatePreset((next) => {
      const index = next.modulation.findIndex(
        (route) => route.source === armed && route.destination === destination,
      );
      if (Math.abs(amount) < 0.005) {
        if (index >= 0) next.modulation.splice(index, 1);
      } else if (index >= 0) next.modulation[index].amount = amount;
      else next.modulation.push({ source: armed, destination, amount });
    });
  };
  const openModule = (next: ModuleId) => {
    setActiveModule(next);
    requestAnimationFrame(() =>
      editor.current?.scrollIntoView({
        block: 'nearest',
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
      }),
    );
  };

  const padOptions: MenuOption<number>[] = kit.pads.map((item, index) => {
    const preset = presets.find((candidate) => candidate.id === item.presetId);
    return {
      value: index,
      label: `${String(index + 1).padStart(2, '0')} · ${item.label}`,
      detail: preset?.name,
      badge: preset?.category,
      keywords: `key ${item.key}`,
    };
  });

  return (
    <section className="screen synth-screen">
      <header className="screen-header synth-header">
        <div className="screen-title">
          <span>SOUND DESIGN / SYNTHESIZER</span>
          <h1>{selectedPreset.name}</h1>
        </div>
        <button
          className="audition-button"
          onPointerDown={(event) => {
            event.preventDefault();
            triggerPad(selectedPadIndex);
          }}
          onClick={(event) => {
            if (event.detail === 0) triggerPad(selectedPadIndex);
          }}
        >
          <Play /> Audition
        </button>
        <button className="save-button" onClick={() => saveSelectedPreset()}>
          <Save /> <span>Save as new</span>
        </button>
      </header>

      <div className="synth-patch-toolbar" data-gesture-lock>
        <SearchMenu
          label="PAD"
          ariaLabel="Sound design pad"
          className="pad-menu"
          value={selectedPadIndex}
          options={padOptions}
          searchable
          placeholder="Search pads or sounds…"
          onChange={(index) => selectPad(index)}
        />
        <SearchMenu
          label="PRESET"
          ariaLabel="Sound design preset"
          className="preset-menu"
          value={pad.presetId}
          options={presetMenuOptions(presets)}
          searchable
          placeholder={`Search ${presets.length} sounds, categories, engines…`}
          onChange={assignPreset}
        />
        <span className="patch-storage-note">
          {selectedPreset.factory
            ? 'Factory sound · edits stay until you save'
            : 'Custom sound'}
        </span>
        <Chips
          ariaLabel="Synthesizer view"
          className="view-tabs"
          value={view}
          options={[
            { value: 'synth', label: 'Synth' },
            { value: 'library', label: 'Library' },
          ]}
          onChange={(next: View) => {
            setView(next);
            setArmed(null);
          }}
        />
      </div>

      <ModAssignProvider
        value={{ armed, routes: selectedPreset.modulation, setAmount }}
      >
        <div
          className={`synth-workbench ${armed ? 'assigning' : ''}`}
          data-gesture-lock
        >
          {view === 'synth' ? (
            <>
              <SynthFlow
                preset={selectedPreset}
                selected={activeModule}
                onSelect={openModule}
                tune={pad.tune}
                padId={pad.id}
              />
              <div className="module-slot" ref={editor}>
                {(activeModule === 'engine1' || activeModule === 'engine2') && (
                  <EngineEditor
                    key={activeModule}
                    preset={selectedPreset}
                    slotIndex={activeModule === 'engine1' ? 0 : 1}
                    updateVoice={updateVoice}
                    switchEngine={switchSlotEngine}
                  />
                )}
                {activeModule === 'combine' && (
                  <CombineEditor
                    preset={selectedPreset}
                    updateVoice={updateVoice}
                    openEngine2={() => openModule('engine2')}
                  />
                )}
                {activeModule === 'filters' && (
                  <FiltersEditor
                    preset={selectedPreset}
                    updateVoice={updateVoice}
                  />
                )}
                {activeModule === 'amp' && (
                  <AmpEditor
                    preset={selectedPreset}
                    updateVoice={updateVoice}
                  />
                )}
                {activeModule === 'fx' && (
                  <EffectsEditor
                    preset={selectedPreset}
                    updatePreset={updatePreset}
                  />
                )}
              </div>
            </>
          ) : (
            <>
              <PadTools />
              <LibraryPanel
                preset={selectedPreset}
                presets={presets}
                padPresetId={pad.presetId}
                assign={assignPreset}
                save={saveSelectedPreset}
                duplicate={duplicateSelectedPreset}
                reset={resetSelectedPreset}
              />
            </>
          )}
        </div>
        {view === 'synth' && (
          <ModStrip
            preset={selectedPreset}
            armed={armed}
            setArmed={setArmed}
            updatePreset={updatePreset}
            openModule={openModule}
          />
        )}
      </ModAssignProvider>
    </section>
  );
}

function LibraryPanel({
  preset,
  presets,
  padPresetId,
  assign,
  save,
  duplicate,
  reset,
}: {
  preset: SynthPreset;
  presets: SynthPreset[];
  padPresetId: string;
  assign: (id: string) => void;
  save: (name?: string) => void;
  duplicate: () => void;
  reset: () => void;
}) {
  const [query, setQuery] = useState('');
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const visible = presets.filter((item) => {
    const text =
      `${item.name} ${item.category} ${item.tags.join(' ')} ${engineSummary(item)}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
  return (
    <div className="library-panel">
      <Panel
        title="Preset actions"
        meta={preset.factory ? 'FACTORY · TEMP EDITS' : 'CUSTOM'}
      >
        <div className="large-action-grid">
          <button onClick={() => save()}>
            <Save /> Save as new
          </button>
          <button onClick={duplicate}>
            <Copy /> Duplicate
          </button>
          <button onClick={reset}>
            <RotateCcw /> Reset
          </button>
          <button onClick={() => save(`New ${engineSummary(preset)} sound`)}>
            <Sparkles /> New sound
          </button>
        </div>
      </Panel>
      <Panel title="Sound library" meta={`${presets.length} PRESETS`}>
        <input
          className="library-search"
          aria-label="Search sounds"
          placeholder="Search sounds…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="preset-list">
          {visible.map((item) => (
            <button
              className={padPresetId === item.id ? 'active' : ''}
              aria-pressed={padPresetId === item.id}
              key={item.id}
              onClick={() => assign(item.id)}
            >
              <span>
                {item.category}
                <i>{engineSummary(item)}</i>
              </span>
              <strong>{item.name}</strong>
              <small>{item.tags.join(' · ')}</small>
            </button>
          ))}
        </div>
      </Panel>
    </div>
  );
}
