"use client";

// Jednorazowy modal: imię użytkownika (localStorage papitrans_user)

import { useState } from "react";

interface Props {
  onSave: (name: string) => void;
}

export function UserNameModal({ onSave }: Props) {
  const [name, setName] = useState("");

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-xs bg-surface rounded-2xl border border-line shadow-2xl p-5">
        <h2 className="text-white font-bold mb-1">Jak masz na imię?</h2>
        <p className="text-xs text-dim mb-4">
          Będzie widoczne przy notatkach i powiadomieniach.
        </p>
        <input
          type="text"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="np. PapiKing"
          className="w-full bg-input border border-line rounded-[10px] px-3 py-2.5 text-[15px] text-ink placeholder:text-dim/50 mb-4"
        />
        <button
          onClick={submit}
          disabled={!name.trim()}
          className="w-full py-2.5 min-h-[44px] rounded-xl bg-amber-brand text-amber-ink font-bold text-sm hover:bg-[#e09420] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150"
        >
          Zapisz
        </button>
      </div>
    </div>
  );
}
