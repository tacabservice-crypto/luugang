import React, { useEffect, useState } from 'react';
import { AGENT_LOCATIONS } from '../utils/agentLocations';

export default function LocationPicker({ value, onChange, disabled = false, className = '', clearOnInput = true }: { value: string; onChange: (value: string) => void; disabled?: boolean; className?: string; clearOnInput?: boolean }) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<string[]>([]);

  useEffect(() => setQuery(value), [value]);
  useEffect(() => {
    const search = query.trim();
    if (search.length < 2 || search === value) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/locations/search?q=${encodeURIComponent(search)}`);
        if (response.ok) setResults(await response.json());
      } catch { setResults([]); }
    }, 350);
    return () => clearTimeout(timer);
  }, [query, value]);

  const suggestions = [...new Set([
    ...AGENT_LOCATIONS.map(item => item.name).filter(name => name.toLowerCase().includes(query.toLowerCase())),
    ...results,
  ])].slice(0, 8);

  return <div className="relative">
    <input
      value={query}
      onChange={event => { setQuery(event.target.value); if (clearOnInput) onChange(''); }}
      placeholder="Search city, e.g. Mogadishu or London"
      disabled={disabled}
      className={className}
      autoComplete="off"
    />
    {query.length >= 2 && query !== value && !disabled && suggestions.length > 0 && (
      <div className="absolute z-[70] mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-gray-600 bg-gray-800 shadow-2xl">
        {suggestions.map(location => <button key={location} type="button" onClick={() => { setQuery(location); onChange(location); setResults([]); }} className="block w-full border-b border-gray-700 px-3 py-2 text-left text-sm text-white hover:bg-purple-600 last:border-0">{location}</button>)}
      </div>
    )}
  </div>;
}
