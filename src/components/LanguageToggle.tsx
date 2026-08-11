/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useLanguage } from '../context/LanguageContext';

export default function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="flex items-center bg-black/50 border border-white/10 p-0.5 rounded-full shadow-inner text-xs">
      <button
        type="button"
        onClick={() => setLanguage('so')}
        className={`px-2 py-0.5 rounded-full font-black text-[10px] transition-all cursor-pointer flex items-center gap-1 ${
          language === 'so'
            ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md'
            : 'text-slate-400 hover:text-white'
        }`}
        title="Af Soomaali"
      >
        <span>🇸🇴</span>
        <span>SO</span>
      </button>

      <button
        type="button"
        onClick={() => setLanguage('en')}
        className={`px-2 py-0.5 rounded-full font-black text-[10px] transition-all cursor-pointer flex items-center gap-1 ${
          language === 'en'
            ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
            : 'text-slate-400 hover:text-white'
        }`}
        title="English"
      >
        <span>🇬🇧</span>
        <span>EN</span>
      </button>
    </div>
  );
}
