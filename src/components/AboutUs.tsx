/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useLanguage } from '../context/LanguageContext';
import { X } from 'lucide-react';

interface AboutUsProps {
  onClose: () => void;
}

export default function AboutUs({ onClose }: AboutUsProps) {
  const { t } = useLanguage();

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-purple-500/30 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 bg-slate-800/80 rounded-full hover:bg-slate-700/80 transition-colors"
        >
          <X className="w-4 h-4 text-slate-300" />
        </button>
        <h1 className="text-2xl font-bold mb-4 text-yellow-400">{t('aboutUs')}</h1>
        <div className="prose prose-invert text-slate-300">
          <p>
            {t('aboutUsContent')}
          </p>
        </div>
      </div>
    </div>
  );
}
