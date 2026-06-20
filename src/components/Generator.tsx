/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Copy, Check, RefreshCw, Key, ShieldCheck, Hash } from 'lucide-react';
import { evaluatePasswordStrength } from '../utils/strength';

export default function Generator() {
  const [length, setLength] = useState<number>(16);
  const [useUpper, setUseUpper] = useState<boolean>(true);
  const [useLower, setUseLower] = useState<boolean>(true);
  const [useNumbers, setUseNumbers] = useState<boolean>(true);
  const [useSymbols, setUseSymbols] = useState<boolean>(true);
  const [excludeAmbiguous, setExcludeAmbiguous] = useState<boolean>(true);
  const [generatedPassword, setGeneratedPassword] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  // Character pools
  const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
  const LOWERCASE_SAFE = 'abcdefghijkmnopqrstuvwxyz'; // Excludes: l, o
  const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const UPPERCASE_SAFE = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // Excludes: I, O
  const NUMBERS = '0123456789';
  const NUMBERS_SAFE = '23456789'; // Excludes: 0, 1
  const SYMBOLS = '!@#$%^&*()_+-=[]{}|;:,.<>?';

  const generate = () => {
    let charset = '';
    
    if (useLower) charset += excludeAmbiguous ? LOWERCASE_SAFE : LOWERCASE;
    if (useUpper) charset += excludeAmbiguous ? UPPERCASE_SAFE : UPPERCASE;
    if (useNumbers) charset += excludeAmbiguous ? NUMBERS_SAFE : NUMBERS;
    if (useSymbols) charset += SYMBOLS;

    if (!charset) {
      setGeneratedPassword('Select at least one option');
      return;
    }

    const randomValues = new Uint32Array(length);
    window.crypto.getRandomValues(randomValues);

    let password = '';
    for (let i = 0; i < length; i++) {
      password += charset[randomValues[i] % charset.length];
    }

    setGeneratedPassword(password);
    setCopied(false);
  };

  useEffect(() => {
    generate();
  }, [length, useUpper, useLower, useNumbers, useSymbols, excludeAmbiguous]);

  const handleCopy = () => {
    if (generatedPassword && generatedPassword !== 'Select at least one option') {
      navigator.clipboard.writeText(generatedPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const strength = evaluatePasswordStrength(generatedPassword);

  const getStrengthBarColor = () => {
    switch (strength.score) {
      case 0: return 'bg-red-500';
      case 1: return 'bg-orange-500';
      case 2: return 'bg-yellow-500';
      case 3: return 'bg-emerald-500';
      case 4: return 'bg-teal-500';
      default: return 'bg-gray-300';
    }
  };

  return (
    <div className="space-y-6" id="password-generator-section">
      <div className="bg-slate-50 dark:bg-zinc-900 border border-slate-200/60 dark:border-zinc-800/60 p-5 rounded-2xl relative shadow-xs">
        <div className="flex items-center justify-between gap-4 mb-3">
          <span className="font-mono text-sm uppercase tracking-wider text-slate-400 dark:text-zinc-500">
            Generated Output
          </span>
          {strength.entropy > 0 && (
            <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-slate-200/60 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400">
              Entropy: {strength.entropy} bits
            </span>
          )}
        </div>
        
        <div className="flex items-center justify-between bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-850 p-4 rounded-xl shadow-xs gap-3">
          <div className="font-mono text-lg md:text-xl font-medium select-all break-all text-slate-900 dark:text-zinc-100 flex-1">
            {generatedPassword}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={generate}
              className="p-2 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-zinc-900 rounded-lg transition-all"
              title="Regenerate password"
              id="btn-regenerate-password"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            <button
              onClick={handleCopy}
              className={`p-2 rounded-lg transition-all flex items-center justify-center ${
                copied 
                  ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400' 
                  : 'text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-zinc-900'
              }`}
              title="Copy to clipboard"
              id="btn-copy-generator-password"
            >
              {copied ? <Check className="w-5 h-5 line-clamp-1" /> : <Copy className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Strength Progress Indicator */}
        <div className="mt-4 space-y-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="font-medium text-slate-600 dark:text-zinc-400">Security Score</span>
            <span className={`font-semibold ${
              strength.score >= 3 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-zinc-400'
            }`}>
              {strength.label}
            </span>
          </div>
          <div className="h-2 w-full bg-slate-200 dark:bg-zinc-800 rounded-full overflow-hidden flex gap-0.5">
            {[0, 1, 2, 3, 4].map((step) => (
              <div 
                key={step} 
                className={`h-full flex-1 transition-all duration-300 ${
                  step <= strength.score ? getStrengthBarColor() : 'bg-slate-200 dark:bg-zinc-800'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Control Panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white dark:bg-zinc-950 border border-slate-100 dark:border-zinc-900 p-5 rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-zinc-900">
            <Hash className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
            <h3 className="font-semibold text-slate-800 dark:text-zinc-200 text-sm">Length Settings</h3>
          </div>
          
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-slate-600 dark:text-zinc-400">Total Characters</span>
              <span className="font-mono text-base font-bold bg-indigo-50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-400 px-3 py-1 rounded-lg">
                {length}
              </span>
            </div>
            
            <input
              type="range"
              min={6}
              max={64}
              value={length}
              onChange={(e) => setLength(parseInt(e.target.value))}
              className="w-full h-2 bg-slate-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-600 dark:accent-indigo-500"
              id="generator-length-slider"
            />
            
            {/* Quick preset lengths */}
            <div className="flex items-center justify-between gap-2 pt-1">
              {[8, 12, 16, 24, 32].map((sz) => (
                <button
                  key={sz}
                  onClick={() => setLength(sz)}
                  className={`flex-1 py-1 rounded-md text-xs font-mono font-semibold border transition-all ${
                    length === sz
                      ? 'bg-indigo-600 text-white border-indigo-600 dark:bg-indigo-605 dark:text-zinc-100 dark:border-indigo-600'
                      : 'bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 border-slate-200 dark:border-zinc-880 hover:border-slate-300 dark:hover:border-zinc-700'
                  }`}
                  id={`preset-len-${sz}`}
                >
                  {sz}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-950 border border-slate-100 dark:border-zinc-900 p-5 rounded-2xl shadow-xs space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-zinc-900">
            <Key className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
            <h3 className="font-semibold text-slate-800 dark:text-zinc-200 text-sm">Character Toggles</h3>
          </div>
          
          <div className="space-y-2.5">
            <label className="flex items-center justify-between p-1.5 hover:bg-slate-50 dark:hover:bg-zinc-900/60 rounded-lg cursor-pointer transition-all">
              <span className="text-sm font-medium text-slate-600 dark:text-zinc-300">Uppercase (A-Z)</span>
              <input
                type="checkbox"
                checked={useUpper}
                onChange={(e) => setUseUpper(e.target.checked)}
                className="w-4.5 h-4.5 rounded-sm text-indigo-600 dark:text-indigo-400 accent-indigo-600 dark:accent-indigo-500 cursor-pointer"
                id="toggle-upper"
              />
            </label>

            <label className="flex items-center justify-between p-1.5 hover:bg-slate-50 dark:hover:bg-zinc-900/60 rounded-lg cursor-pointer transition-all">
              <span className="text-sm font-medium text-slate-600 dark:text-zinc-300">Lowercase (a-z)</span>
              <input
                type="checkbox"
                checked={useLower}
                onChange={(e) => setUseLower(e.target.checked)}
                className="w-4.5 h-4.5 rounded-sm text-indigo-600 dark:text-indigo-400 accent-indigo-600 dark:accent-indigo-500 cursor-pointer"
                id="toggle-lower"
              />
            </label>

            <label className="flex items-center justify-between p-1.5 hover:bg-slate-50 dark:hover:bg-zinc-900/60 rounded-lg cursor-pointer transition-all">
              <span className="text-sm font-medium text-slate-600 dark:text-zinc-300">Numbers (0-9)</span>
              <input
                type="checkbox"
                checked={useNumbers}
                onChange={(e) => setUseNumbers(e.target.checked)}
                className="w-4.5 h-4.5 rounded-sm text-indigo-600 dark:text-indigo-400 accent-indigo-600 dark:accent-indigo-500 cursor-pointer"
                id="toggle-numbers"
              />
            </label>

            <label className="flex items-center justify-between p-1.5 hover:bg-slate-50 dark:hover:bg-zinc-900/60 rounded-lg cursor-pointer transition-all">
              <span className="text-sm font-medium text-slate-600 dark:text-zinc-300">Symbols (!@#$...)</span>
              <input
                type="checkbox"
                checked={useSymbols}
                onChange={(e) => setUseSymbols(e.target.checked)}
                className="w-4.5 h-4.5 rounded-sm text-indigo-600 dark:text-indigo-400 accent-indigo-600 dark:accent-indigo-500 cursor-pointer"
                id="toggle-symbols"
              />
            </label>

            <label className="flex items-center justify-between p-1.5 hover:bg-slate-50 dark:hover:bg-zinc-900/60 rounded-lg cursor-pointer transition-all border-t border-slate-100 dark:border-zinc-900 mt-1 pt-2">
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-slate-700 dark:text-zinc-250">Exclude Confusing Letters</span>
                <span className="text-[10px] text-slate-400 dark:text-zinc-500 max-w-[180px] leading-tight">Removes ambiguous characters like l, 1, o, 0, I, O</span>
              </div>
              <input
                type="checkbox"
                checked={excludeAmbiguous}
                onChange={(e) => setExcludeAmbiguous(e.target.checked)}
                className="w-4.5 h-4.5 rounded-sm text-indigo-600 dark:text-indigo-400 accent-indigo-600 dark:accent-indigo-500 cursor-pointer"
                id="toggle-exclude-confusing"
              />
            </label>
          </div>
        </div>
      </div>

      {strength.suggestions.length > 0 && (
        <div className="p-4 bg-indigo-50/50 dark:bg-indigo-950/10 border border-indigo-150/40 dark:border-indigo-900/20 rounded-xl flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-xs font-semibold text-indigo-900 dark:text-indigo-300">Security Insights</h4>
            <ul className="text-xs text-slate-600 dark:text-zinc-400 list-disc pl-4 space-y-1">
              {strength.suggestions.map((sug, i) => (
                <li key={i}>{sug}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
