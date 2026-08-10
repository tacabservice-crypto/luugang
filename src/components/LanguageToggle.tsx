/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useLanguage } from '../context/LanguageContext';

export default function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="flex items-center justify-between w-full">
       <div className="flex items-center gap-1.5 text-slate-300 font-semibold text-xs">
        <span>Language</span>
      </div>
      <div className="flex items-center bg-black/40 border border-white/10 p-0.5 rounded-full shadow-inner text-xs">
        <button
          type="button"
          onClick={() => setLanguage('en')}
          className={`px-2 py-0.5 rounded-full font-black text-[10px] transition-all cursor-pointer flex items-center gap-1 ${
            language === 'en'
              ? 'bg-blue-600/50 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <span>🇬🇧</span>
          <span>EN</span>
        </button>
      </div>
    </div>
  );
}
