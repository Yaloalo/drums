'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (value: boolean) => {
      document.documentElement.dataset.theme = value ? 'dark' : 'light';
      document.documentElement.classList.toggle('dark', value);
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', value ? '#17242e' : '#f4f8f9');
      setDark(value);
    };
    apply(query.matches);
    const onChange = (event: MediaQueryListEvent) => apply(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  const toggle = () => {
    const next = !dark;
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
    document.documentElement.classList.toggle('dark', next);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', next ? '#17242e' : '#f4f8f9');
    setDark(next);
  };
  return (
    <button
      className="theme-toggle icon-button"
      onClick={toggle}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={dark ? 'Light theme' : 'Dark theme'}
    >
      {dark ? <Sun /> : <Moon />}
    </button>
  );
}
