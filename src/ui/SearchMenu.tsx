'use client';

/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/click-events-have-key-events -- A styled, searchable menu needs the ARIA combobox/listbox pattern: focus stays on the search input or list, which handle the keys via aria-activedescendant. */

import { useEffect, useId, useRef, useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import { Check, ChevronDown, Search } from 'lucide-react';

export interface MenuOption<T extends string | number = string> {
  value: T;
  label: string;
  /** Second line under the label. */
  detail?: string;
  /** Options sharing a group are listed under one heading. */
  group?: string;
  /** Short tag on the right, e.g. the engine of a preset. */
  badge?: string;
  /** Extra words that match a search without being shown. */
  keywords?: string;
  disabled?: boolean;
}

interface SearchMenuProps<T extends string | number> {
  value: T;
  options: MenuOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  /** Small caps caption inside the trigger. */
  label?: string;
  /** Defaults to on for lists longer than eight options. */
  searchable?: boolean;
  placeholder?: string;
  className?: string;
  align?: 'start' | 'center' | 'end';
  /** Text shown when `value` matches no option. */
  emptyValue?: string;
}

function matches(option: MenuOption<string | number>, words: string[]) {
  const text =
    `${option.label} ${option.detail ?? ''} ${option.group ?? ''} ${option.badge ?? ''} ${option.keywords ?? ''}`.toLowerCase();
  return words.every((word) => text.includes(word));
}

/** A themed, searchable replacement for a native select. */
export function SearchMenu<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
  label,
  searchable = options.length > 8,
  placeholder = 'Search…',
  className = '',
  align = 'start',
  emptyValue = 'Choose…',
}: SearchMenuProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const selected = options.find((option) => option.value === value);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const visible = words.length
    ? options.filter((option) => matches(option, words))
    : options;
  const groups: {
    name?: string;
    items: { option: MenuOption<T>; index: number }[];
  }[] = [];
  visible.forEach((option, index) => {
    const last = groups.at(-1);
    if (last && last.name === option.group) last.items.push({ option, index });
    else groups.push({ name: option.group, items: [{ option, index }] });
  });
  const optionId = (index: number) => `${id}-option-${index}`;

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() =>
      document
        .getElementById(`${id}-option-${active}`)
        ?.scrollIntoView({ block: 'nearest' }),
    );
    return () => cancelAnimationFrame(frame);
  }, [active, open, id]);

  const choose = (option: MenuOption<T> | undefined) => {
    if (!option || option.disabled) return;
    onChange(option.value);
    setOpen(false);
    setQuery('');
  };
  const move = (event: React.KeyboardEvent) => {
    const last = visible.length - 1;
    const step = (from: number, direction: 1 | -1) => {
      let next = from;
      for (let i = 0; i <= last; i++) {
        next = Math.max(0, Math.min(last, next + direction));
        if (!visible[next]?.disabled) return next;
      }
      return from;
    };
    if (event.key === 'ArrowDown') setActive((current) => step(current, 1));
    else if (event.key === 'ArrowUp') setActive((current) => step(current, -1));
    else if (event.key === 'Home') setActive(step(-1, 1));
    else if (event.key === 'End') setActive(step(last + 1, -1));
    else if (event.key === 'Enter' || (!searchable && event.key === ' '))
      choose(visible[active]);
    else return;
    event.preventDefault();
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setQuery('');
        if (next)
          setActive(
            Math.max(
              0,
              options.findIndex((option) => option.value === value),
            ),
          );
      }}
    >
      <Popover.Trigger
        className={`search-menu-trigger ${className}`}
        aria-label={`${ariaLabel}: ${selected?.label ?? emptyValue}`}
        aria-haspopup="listbox"
      >
        {label && <span className="search-menu-caption">{label}</span>}
        <span className="search-menu-value">
          <strong>{selected?.label ?? emptyValue}</strong>
          {selected?.detail && <small>{selected.detail}</small>}
        </span>
        <ChevronDown className="search-menu-chevron" aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align={align}
          sideOffset={6}
          collisionPadding={12}
          className="search-menu-positioner"
        >
          <Popover.Popup
            className="search-menu"
            initialFocus={searchable ? input : list}
            data-gesture-lock
            data-keyboard-lock
          >
            {searchable && (
              <label className="search-menu-search">
                <Search aria-hidden="true" />
                <input
                  ref={input}
                  role="combobox"
                  aria-label={`Search ${ariaLabel.toLowerCase()}`}
                  aria-expanded="true"
                  aria-controls={`${id}-list`}
                  aria-activedescendant={
                    visible.length ? optionId(active) : undefined
                  }
                  aria-autocomplete="list"
                  placeholder={placeholder}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActive(0);
                  }}
                  onKeyDown={move}
                />
              </label>
            )}
            <div
              ref={list}
              id={`${id}-list`}
              className="search-menu-list"
              role="listbox"
              aria-label={ariaLabel}
              tabIndex={searchable ? -1 : 0}
              aria-activedescendant={
                !searchable && visible.length ? optionId(active) : undefined
              }
              onKeyDown={searchable ? undefined : move}
            >
              {groups.map((group, groupIndex) => {
                const items = group.items.map(({ option, index }) => (
                  <div
                    key={String(option.value)}
                    id={optionId(index)}
                    role="option"
                    tabIndex={-1}
                    aria-selected={option.value === value}
                    aria-disabled={option.disabled || undefined}
                    className="search-menu-option"
                    data-active={index === active || undefined}
                    onPointerMove={() => {
                      if (!option.disabled && index !== active)
                        setActive(index);
                    }}
                    onClick={() => choose(option)}
                  >
                    <span className="search-menu-mark" aria-hidden="true">
                      {option.value === value && <Check />}
                    </span>
                    <span className="search-menu-text">
                      <strong>{option.label}</strong>
                      {option.detail && <small>{option.detail}</small>}
                    </span>
                    {option.badge && <i>{option.badge}</i>}
                  </div>
                ));
                return group.name ? (
                  <div
                    role="group"
                    aria-label={group.name}
                    key={`${group.name}-${groupIndex}`}
                  >
                    <div className="search-menu-group" aria-hidden="true">
                      {group.name}
                    </div>
                    {items}
                  </div>
                ) : (
                  items
                );
              })}
              {!visible.length && (
                <div className="search-menu-empty">No matches</div>
              )}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
